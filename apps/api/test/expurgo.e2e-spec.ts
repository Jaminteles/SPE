import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  AuditoriaAcao,
  PerfilCodigo,
  PerguntaTipo,
  PrismaClient,
  RespostaStatus,
} from '@prisma/client';
import { randomBytes, randomUUID } from 'node:crypto';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { SenhaService } from '../src/auth/senha.service';
import { TodasExcecoesFilter } from '../src/common/filters/todas-excecoes.filter';
import { ExpurgoService } from '../src/expurgo/expurgo.service';

/**
 * E2E do expurgo (LGPD), contra banco de verdade.
 *
 * Prova os dois prazos do escopo:
 *
 *   1. encerrar a coleta apaga os dados técnicos de duplicidade;
 *   2. passados os 4 anos, a resposta sai fisicamente da base.
 *
 * O segundo é exercitado adiantando o relógio no dado (o prazo gravado), não
 * esperando quatro anos — o que se testa é a regra, não o calendário.
 */
describe('Expurgo (e2e)', () => {
  let app: INestApplication;
  let expurgo: ExpurgoService;
  const prisma = new PrismaClient();
  const senhas = new SenhaService();

  const marca = Date.now();
  const emailAdmin = `admin.expurgo.${marca}@exemplo.br`;
  const emailAnalista = `analista.expurgo.${marca}@exemplo.br`;
  const SENHA = 'Senha-De-Teste-2026';

  const SALVADOR = 2927408;
  const TOTAL_DE_RESPOSTAS = 12;

  let idAdmin = '';
  let idAnalista = '';
  let tokenAdmin = '';
  let tokenAnalista = '';
  let formularioId = '';
  let perguntaId = '';
  const alternativas: string[] = [];

  const comoAdmin = () => ({ Authorization: `Bearer ${tokenAdmin}` });
  const comoAnalista = () => ({ Authorization: `Bearer ${tokenAnalista}` });

  async function popular(): Promise<void> {
    const respostas = [];
    const itens: { respostaId: string; perguntaId: string; alternativaId: string }[] = [];

    for (let indice = 0; indice < TOTAL_DE_RESPOSTAS; indice += 1) {
      const id = randomUUID();
      const momento = new Date();

      respostas.push({
        id,
        formularioId,
        municipioCodigoIbge: SALVADOR,
        status: RespostaStatus.VALIDA,
        origem: 'APLICATIVO' as const,
        dispositivoHash: randomBytes(32).toString('hex'),
        consentimentoEm: momento,
        iniciadoEm: momento,
        coletadoEm: momento,
        recebidoEm: momento,
        duracaoSegundos: 90,
      });

      itens.push({ respostaId: id, perguntaId, alternativaId: alternativas[indice % 2] });
    }

    await prisma.resposta.createMany({ data: respostas });
    await prisma.respostaItem.createMany({ data: itens });

    // Sessões de coleta: são o outro dado técnico que precisa sumir.
    await prisma.sessaoColeta.createMany({
      data: Array.from({ length: 3 }, () => ({
        formularioId,
        tokenHash: randomBytes(32).toString('hex'),
        origemHash: randomBytes(32).toString('hex'),
        expiraEm: new Date(Date.now() + 60 * 60 * 1000),
      })),
    });
  }

  beforeAll(async () => {
    const senhaHash = await senhas.gerarHash(SENHA);
    const criarUsuario = async (nome: string, email: string, perfil: PerfilCodigo) => {
      const usuario = await prisma.usuario.create({
        data: { nome, email, senhaHash, perfil: { connect: { codigo: perfil } } },
        select: { id: true },
      });
      return usuario.id;
    };

    idAdmin = await criarUsuario('Admin Expurgo', emailAdmin, PerfilCodigo.ADMINISTRADOR);
    idAnalista = await criarUsuario('Analista Expurgo', emailAnalista, PerfilCodigo.ANALISTA);

    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new TodasExcecoesFilter());
    await app.init();
    expurgo = app.get(ExpurgoService);

    const entrar = async (email: string) => {
      const resposta = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, senha: SENHA })
        .expect(200);
      return resposta.body.accessToken as string;
    };
    tokenAdmin = await entrar(emailAdmin);
    tokenAnalista = await entrar(emailAnalista);

    const criado = await request(app.getHttpServer())
      .post('/api/v1/formularios')
      .set(comoAdmin())
      .send({ titulo: `Pesquisa de expurgo ${marca}` })
      .expect(201);
    formularioId = criado.body.id;

    const pergunta = await request(app.getHttpServer())
      .post(`/api/v1/formularios/${formularioId}/perguntas`)
      .set(comoAdmin())
      .send({ enunciado: 'Em quem você votaria?', tipo: PerguntaTipo.UNICA_ESCOLHA })
      .expect(201);
    perguntaId = pergunta.body.id;

    for (const texto of ['Candidato A', 'Candidato B']) {
      const alternativa = await request(app.getHttpServer())
        .post(`/api/v1/formularios/${formularioId}/perguntas/${perguntaId}/alternativas`)
        .set(comoAdmin())
        .send({ texto })
        .expect(201);
      alternativas.push(alternativa.body.id);
    }

    await request(app.getHttpServer())
      .post(`/api/v1/formularios/${formularioId}/publicar`)
      .set(comoAdmin())
      .expect(200);

    await popular();
  });

  afterAll(async () => {
    const respostas = await prisma.resposta.findMany({
      where: { formularioId },
      select: { id: true },
    });
    await prisma.respostaItem.deleteMany({
      where: { respostaId: { in: respostas.map((resposta) => resposta.id) } },
    });
    await prisma.resposta.deleteMany({ where: { formularioId } });
    await prisma.sessaoColeta.deleteMany({ where: { formularioId } });
    await prisma.formulario.deleteMany({ where: { criadoPorId: { in: [idAdmin, idAnalista] } } });
    await prisma.logAuditoria.deleteMany({ where: { usuarioId: { in: [idAdmin, idAnalista] } } });
    await prisma.sessao.deleteMany({ where: { usuarioId: { in: [idAdmin, idAnalista] } } });
    await prisma.usuario.deleteMany({ where: { id: { in: [idAdmin, idAnalista] } } });
    await prisma.$disconnect();
    await app.close();
  });

  describe('controle de acesso', () => {
    it('só o Administrador acompanha e dispara o expurgo', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/expurgo/situacao')
        .set(comoAnalista())
        .expect(403);

      await request(app.getHttpServer())
        .post('/api/v1/expurgo/executar')
        .set(comoAnalista())
        .expect(403);

      await request(app.getHttpServer()).get('/api/v1/expurgo/situacao').expect(401);

      await request(app.getHttpServer())
        .get('/api/v1/expurgo/situacao')
        .set(comoAdmin())
        .expect(200);
    });

    it('a situação não devolve nada de respondente', async () => {
      const resposta = await request(app.getHttpServer())
        .get('/api/v1/expurgo/situacao')
        .set(comoAdmin())
        .expect(200);

      const corpo = JSON.stringify(resposta.body).toLowerCase();
      expect(corpo).not.toContain('hash');
      expect(corpo).not.toContain('latitude');
      expect(Object.keys(resposta.body)).toEqual(
        expect.arrayContaining(['respostasVencidas', 'pesquisasComExpurgoTecnicoPendente']),
      );
    });
  });

  describe('encerramento da coleta', () => {
    it('apaga os dados técnicos de duplicidade e carimba o prazo das respostas', async () => {
      const antes = await prisma.resposta.count({
        where: { formularioId, dispositivoHash: { not: null } },
      });
      expect(antes).toBe(TOTAL_DE_RESPOSTAS);

      await request(app.getHttpServer())
        .post(`/api/v1/formularios/${formularioId}/encerrar`)
        .set(comoAdmin())
        .expect(200);

      const [comHash, sessoes, semPrazo, formulario] = await Promise.all([
        prisma.resposta.count({ where: { formularioId, dispositivoHash: { not: null } } }),
        prisma.sessaoColeta.count({ where: { formularioId } }),
        prisma.resposta.count({ where: { formularioId, expurgarApos: null } }),
        prisma.formulario.findUnique({
          where: { id: formularioId },
          select: { encerradoEm: true, expurgoTecnicoEm: true },
        }),
      ]);

      expect(comHash).toBe(0);
      expect(sessoes).toBe(0);
      expect(semPrazo).toBe(0);
      expect(formulario?.expurgoTecnicoEm).toBeInstanceOf(Date);

      // O prazo é o encerramento + 4 anos.
      const resposta = await prisma.resposta.findFirst({
        where: { formularioId },
        select: { expurgarApos: true },
      });
      const esperado = new Date(formulario!.encerradoEm!);
      esperado.setUTCFullYear(esperado.getUTCFullYear() + 4);
      expect(resposta?.expurgarApos?.toISOString()).toBe(esperado.toISOString());
    });

    it('as respostas continuam na base: expurgo técnico não é expurgo de resultado', async () => {
      const total = await prisma.resposta.count({ where: { formularioId } });

      expect(total).toBe(TOTAL_DE_RESPOSTAS);
    });

    it('registra o expurgo técnico em auditoria, sem hash nenhum', async () => {
      const registro = await prisma.logAuditoria.findFirst({
        where: { acao: AuditoriaAcao.EXPURGO_TECNICO, entidadeId: formularioId },
        orderBy: { criadoEm: 'desc' },
      });

      expect(registro).not.toBeNull();
      const detalhe = JSON.stringify(registro?.detalhe).toLowerCase();
      expect(detalhe).toContain('respostasanonimizadas');
      expect(detalhe).not.toContain('dispositivo_hash');
      expect(detalhe).not.toContain('tokenhash');
    });

    it('é idempotente: rodar de novo não muda nada', async () => {
      const antes = await prisma.formulario.findUnique({
        where: { id: formularioId },
        select: { expurgoTecnicoEm: true },
      });

      await expurgo.executarAgora(formularioId);

      const depois = await prisma.formulario.findUnique({
        where: { id: formularioId },
        select: { expurgoTecnicoEm: true },
      });
      expect(depois?.expurgoTecnicoEm?.toISOString()).toBe(antes?.expurgoTecnicoEm?.toISOString());
    });
  });

  describe('prazo de retenção das respostas', () => {
    it('apaga resposta e itens quando o prazo vence, e audita o volume', async () => {
      // Adianta o relógio no dado: o que se testa é a regra, não o calendário.
      await prisma.resposta.updateMany({
        where: { formularioId },
        data: { expurgarApos: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      });

      const resumo = await expurgo.executarAgora();

      expect(resumo.respostasApagadas).toBeGreaterThanOrEqual(TOTAL_DE_RESPOSTAS);

      const [respostas, itens] = await Promise.all([
        prisma.resposta.count({ where: { formularioId } }),
        prisma.respostaItem.count({ where: { perguntaId } }),
      ]);
      expect(respostas).toBe(0);
      expect(itens).toBe(0);

      const registro = await prisma.logAuditoria.findFirst({
        where: { acao: AuditoriaAcao.EXPURGO_RESPOSTAS },
        orderBy: { criadoEm: 'desc' },
      });
      expect(registro).not.toBeNull();
      expect(registro?.criadoEm).toBeInstanceOf(Date);
    });

    it('não apaga resposta cujo prazo ainda não venceu', async () => {
      const outro = await request(app.getHttpServer())
        .post('/api/v1/formularios')
        .set(comoAdmin())
        .send({ titulo: `Pesquisa em prazo ${marca}` })
        .expect(201);

      const id = randomUUID();
      await prisma.resposta.create({
        data: {
          id,
          formularioId: outro.body.id,
          municipioCodigoIbge: SALVADOR,
          status: RespostaStatus.VALIDA,
          origem: 'APLICATIVO',
          dispositivoHash: randomBytes(32).toString('hex'),
          consentimentoEm: new Date(),
          iniciadoEm: new Date(),
          coletadoEm: new Date(),
          recebidoEm: new Date(),
          duracaoSegundos: 90,
          expurgarApos: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        },
      });

      await expurgo.executarAgora();

      expect(await prisma.resposta.count({ where: { id } })).toBe(1);

      await prisma.resposta.delete({ where: { id } });
      await prisma.formulario.delete({ where: { id: outro.body.id } });
    });
  });
});
