import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PerfilCodigo, PerguntaTipo, PrismaClient, RespostaStatus } from '@prisma/client';
import { createHmac, randomUUID } from 'node:crypto';
import request from 'supertest';

import { AgregacaoService } from '../src/agregacao/agregacao.service';
import { AppModule } from '../src/app.module';
import { SenhaService } from '../src/auth/senha.service';
import { TodasExcecoesFilter } from '../src/common/filters/todas-excecoes.filter';

/**
 * E2E do critério de aceite da Sprint 6, contra banco de verdade e com base
 * populada: o resultado sai das views materializadas em tempo aceitável e os
 * filtros mudam de fato o que é devolvido.
 */
describe('Resultados (e2e)', () => {
  let app: INestApplication;
  let agregacao: AgregacaoService;
  const prisma = new PrismaClient();
  const senhas = new SenhaService();

  const marca = Date.now();
  const emailAdmin = `admin.resultados.${marca}@exemplo.br`;
  const emailAnalista = `analista.resultados.${marca}@exemplo.br`;
  const SENHA = 'Senha-De-Teste-2026';

  const SALVADOR = 2927408;
  const FEIRA = 2910800;
  const TOTAL_DE_RESPOSTAS = 240;

  let idAdmin = '';
  let idAnalista = '';
  let tokenAdmin = '';
  let tokenAnalista = '';
  let formularioId = '';
  let perguntaVoto = '';
  let perguntaNota = '';
  const alternativas: string[] = [];

  const comoAdmin = () => ({ Authorization: `Bearer ${tokenAdmin}` });
  const comoAnalista = () => ({ Authorization: `Bearer ${tokenAnalista}` });
  const rota = (sufixo = '') => `/api/v1/resultados/${formularioId}${sufixo}`;

  /**
   * Popula direto no banco: o objetivo aqui é ter volume para medir a leitura,
   * não reexercitar a coleta (que tem suite própria).
   */
  async function popular() {
    const pepper = process.env.DEVICE_HASH_PEPPER as string;
    const respostas: {
      id: string;
      formularioId: string;
      municipioCodigoIbge: number;
      status: RespostaStatus;
      origem: 'APLICATIVO';
      dispositivoHash: string;
      consentimentoEm: Date;
      iniciadoEm: Date;
      coletadoEm: Date;
      recebidoEm: Date;
      duracaoSegundos: number;
      invalidadaEm: Date | null;
      motivoInvalidacao: string | null;
    }[] = [];
    const itens: { respostaId: string; perguntaId: string; alternativaId: string }[] = [];

    for (let indice = 0; indice < TOTAL_DE_RESPOSTAS; indice += 1) {
      const id = randomUUID();
      // Três dias de coleta, dois municípios, distribuição desigual entre as
      // alternativas — para o filtro ter o que mudar.
      const diasAtras = indice % 3;
      const momento = new Date(Date.now() - diasAtras * 24 * 60 * 60 * 1000);
      const municipio = indice % 4 === 0 ? FEIRA : SALVADOR;
      const escolha = indice % 10 < 5 ? 0 : indice % 10 < 8 ? 1 : 2;
      const invalidada = indice % 40 === 0;

      respostas.push({
        id,
        formularioId,
        municipioCodigoIbge: municipio,
        status: invalidada ? RespostaStatus.INVALIDADA : RespostaStatus.VALIDA,
        origem: 'APLICATIVO',
        dispositivoHash: createHmac('sha256', pepper).update(id).digest('hex'),
        consentimentoEm: momento,
        iniciadoEm: momento,
        coletadoEm: momento,
        recebidoEm: momento,
        duracaoSegundos: 60 + (indice % 30),
        // O banco exige data e motivo quando a resposta está invalidada.
        invalidadaEm: invalidada ? momento : null,
        motivoInvalidacao: invalidada ? 'Conferência de teste' : null,
      });

      itens.push({
        respostaId: id,
        perguntaId: perguntaVoto,
        alternativaId: alternativas[escolha],
      });
    }

    await prisma.resposta.createMany({ data: respostas });
    await prisma.respostaItem.createMany({ data: itens });
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

    idAdmin = await criarUsuario('Admin Resultados', emailAdmin, PerfilCodigo.ADMINISTRADOR);
    idAnalista = await criarUsuario('Analista Resultados', emailAnalista, PerfilCodigo.ANALISTA);

    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new TodasExcecoesFilter());
    await app.init();
    agregacao = app.get(AgregacaoService);

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
      .send({ titulo: `Pesquisa de resultados ${marca}` })
      .expect(201);
    formularioId = criado.body.id;

    const voto = await request(app.getHttpServer())
      .post(`/api/v1/formularios/${formularioId}/perguntas`)
      .set(comoAdmin())
      .send({ enunciado: 'Em quem você votaria?', tipo: PerguntaTipo.UNICA_ESCOLHA })
      .expect(201);
    perguntaVoto = voto.body.id;

    for (const texto of ['Candidato A', 'Candidato B', 'Nenhum deles']) {
      const alternativa = await request(app.getHttpServer())
        .post(`/api/v1/formularios/${formularioId}/perguntas/${perguntaVoto}/alternativas`)
        .set(comoAdmin())
        .send({ texto })
        .expect(201);
      alternativas.push(alternativa.body.id);
    }

    const nota = await request(app.getHttpServer())
      .post(`/api/v1/formularios/${formularioId}/perguntas`)
      .set(comoAdmin())
      .send({
        enunciado: 'Que nota você dá para a gestão?',
        tipo: PerguntaTipo.ESCALA,
        escalaMinimo: 0,
        escalaMaximo: 10,
      })
      .expect(201);
    perguntaNota = nota.body.id;

    await request(app.getHttpServer())
      .post(`/api/v1/formularios/${formularioId}/publicar`)
      .set(comoAdmin())
      .expect(200);

    await popular();
    await agregacao.atualizarAgora(idAdmin);
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
    it('o Analista lê resultado', async () => {
      await request(app.getHttpServer()).get(rota('/indicadores')).set(comoAnalista()).expect(200);
    });

    it('o Analista continua barrado na administração, trocando ou não o id', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/formularios/${formularioId}`)
        .set(comoAnalista())
        .expect(403);

      await request(app.getHttpServer())
        .get(`/api/v1/formularios/${formularioId}/respostas`)
        .set(comoAnalista())
        .expect(403);

      await request(app.getHttpServer())
        .get(`/api/v1/formularios/${randomUUID()}/respostas`)
        .set(comoAnalista())
        .expect(403);

      await request(app.getHttpServer())
        .post('/api/v1/agregacao/atualizar')
        .set(comoAnalista())
        .expect(403);
    });

    it('resultado sem token responde 401', async () => {
      await request(app.getHttpServer()).get(rota('/indicadores')).expect(401);
    });

    it('rascunho não tem resultado', async () => {
      const rascunho = await request(app.getHttpServer())
        .post('/api/v1/formularios')
        .set(comoAdmin())
        .send({ titulo: `Rascunho ${marca}` })
        .expect(201);

      await request(app.getHttpServer())
        .get(`/api/v1/resultados/${rascunho.body.id}/indicadores`)
        .set(comoAnalista())
        .expect(404);

      await request(app.getHttpServer())
        .delete(`/api/v1/formularios/${rascunho.body.id}`)
        .set(comoAdmin())
        .expect(204);
    });
  });

  describe('indicadores', () => {
    it('devolve totais coerentes com a base populada', async () => {
      const resposta = await request(app.getHttpServer())
        .get(rota('/indicadores'))
        .set(comoAnalista())
        .expect(200);

      const invalidadas = Math.ceil(TOTAL_DE_RESPOSTAS / 40);
      expect(resposta.body.respostasValidas).toBe(TOTAL_DE_RESPOSTAS - invalidadas);
      expect(resposta.body.respostasInvalidadas).toBe(invalidadas);
      expect(resposta.body.municipiosAlcancados).toBe(2);
      expect(resposta.body.municipiosDaBahia).toBe(417);
    });

    it('o filtro de município muda o total', async () => {
      const total = await request(app.getHttpServer())
        .get(rota('/indicadores'))
        .set(comoAnalista())
        .expect(200);

      const soFeira = await request(app.getHttpServer())
        .get(rota(`/indicadores?municipioCodigoIbge=${FEIRA}`))
        .set(comoAnalista())
        .expect(200);

      expect(soFeira.body.respostasValidas).toBeGreaterThan(0);
      expect(soFeira.body.respostasValidas).toBeLessThan(total.body.respostasValidas);
    });
  });

  describe('resultado por pergunta', () => {
    it('devolve as alternativas com percentual somando 100', async () => {
      const resposta = await request(app.getHttpServer())
        .get(rota('/perguntas'))
        .set(comoAnalista())
        .expect(200);

      const pergunta = resposta.body.perguntas.find(
        (item: { perguntaId: string }) => item.perguntaId === perguntaVoto,
      );

      expect(pergunta.alternativas).toHaveLength(3);
      const soma = pergunta.alternativas.reduce(
        (total: number, item: { percentual: number }) => total + item.percentual,
        0,
      );
      expect(soma).toBeGreaterThan(99.5);
      expect(soma).toBeLessThan(100.5);

      // A distribuição populada é desigual de propósito.
      expect(pergunta.alternativas[0].total).toBeGreaterThan(pergunta.alternativas[2].total);
    });

    it('pergunta sem alternativa não entra no gráfico', async () => {
      const resposta = await request(app.getHttpServer())
        .get(rota('/perguntas'))
        .set(comoAnalista())
        .expect(200);

      expect(
        resposta.body.perguntas.some(
          (item: { perguntaId: string }) => item.perguntaId === perguntaNota,
        ),
      ).toBe(false);
    });

    it('o filtro de pergunta restringe o retorno', async () => {
      const resposta = await request(app.getHttpServer())
        .get(rota(`/perguntas?perguntaId=${perguntaVoto}`))
        .set(comoAnalista())
        .expect(200);

      expect(resposta.body.perguntas).toHaveLength(1);
      expect(resposta.body.perguntas[0].perguntaId).toBe(perguntaVoto);
    });

    it('o filtro de município muda os números da pergunta', async () => {
      const geral = await request(app.getHttpServer())
        .get(rota('/perguntas'))
        .set(comoAnalista())
        .expect(200);

      const feira = await request(app.getHttpServer())
        .get(rota(`/perguntas?municipioCodigoIbge=${FEIRA}`))
        .set(comoAnalista())
        .expect(200);

      const totalGeral = geral.body.perguntas[0].totalDeRespostas;
      const totalFeira = feira.body.perguntas[0].totalDeRespostas;

      expect(totalFeira).toBeGreaterThan(0);
      expect(totalFeira).toBeLessThan(totalGeral);
    });

    it('o filtro de período muda os números da pergunta', async () => {
      const hoje = new Date().toISOString().slice(0, 10);

      const soHoje = await request(app.getHttpServer())
        .get(rota(`/perguntas?de=${hoje}`))
        .set(comoAnalista())
        .expect(200);

      const tudo = await request(app.getHttpServer())
        .get(rota('/perguntas'))
        .set(comoAnalista())
        .expect(200);

      expect(soHoje.body.perguntas[0].totalDeRespostas).toBeGreaterThan(0);
      expect(soHoje.body.perguntas[0].totalDeRespostas).toBeLessThan(
        tudo.body.perguntas[0].totalDeRespostas,
      );
    });

    it('recusa filtro com valor inválido', async () => {
      await request(app.getHttpServer())
        .get(rota('/perguntas?municipioCodigoIbge=abc'))
        .set(comoAnalista())
        .expect(400);

      await request(app.getHttpServer())
        .get(rota('/perguntas?perguntaId=nao-e-uuid'))
        .set(comoAnalista())
        .expect(400);

      await request(app.getHttpServer())
        .get(rota('/perguntas?campoInventado=1'))
        .set(comoAnalista())
        .expect(400);
    });
  });

  describe('evolução da coleta', () => {
    it('devolve série diária acumulada', async () => {
      const resposta = await request(app.getHttpServer())
        .get(rota('/evolucao'))
        .set(comoAnalista())
        .expect(200);

      expect(resposta.body.pontos.length).toBe(3);

      const acumulados = resposta.body.pontos.map(
        (ponto: { acumulado: number }) => ponto.acumulado,
      );
      expect(acumulados).toEqual([...acumulados].sort((a, b) => a - b));

      const ultimo = acumulados[acumulados.length - 1];
      expect(ultimo).toBe(TOTAL_DE_RESPOSTAS - Math.ceil(TOTAL_DE_RESPOSTAS / 40));
    });

    it('o filtro de período encurta a série', async () => {
      const hoje = new Date().toISOString().slice(0, 10);

      const resposta = await request(app.getHttpServer())
        .get(rota(`/evolucao?de=${hoje}`))
        .set(comoAnalista())
        .expect(200);

      expect(resposta.body.pontos.length).toBe(1);
    });
  });

  describe('municípios', () => {
    it('lista o alcance por município, com nome vindo da base do IBGE', async () => {
      const resposta = await request(app.getHttpServer())
        .get(rota('/municipios'))
        .set(comoAnalista())
        .expect(200);

      expect(resposta.body.municipios).toHaveLength(2);
      expect(resposta.body.municipios[0].respostasValidas).toBeGreaterThanOrEqual(
        resposta.body.municipios[1].respostasValidas,
      );
      expect(resposta.body.municipios.map((m: { nome: string }) => m.nome)).toContain('Salvador');
    });
  });

  describe('desempenho e privacidade', () => {
    it('responde o painel inteiro em tempo aceitável', async () => {
      const inicio = Date.now();

      await Promise.all([
        request(app.getHttpServer()).get(rota('/indicadores')).set(comoAnalista()).expect(200),
        request(app.getHttpServer()).get(rota('/perguntas')).set(comoAnalista()).expect(200),
        request(app.getHttpServer()).get(rota('/evolucao')).set(comoAnalista()).expect(200),
        request(app.getHttpServer()).get(rota('/municipios')).set(comoAnalista()).expect(200),
      ]);

      const duracao = Date.now() - inicio;
      // Quatro consultas do painel, base populada, tudo saindo de view materializada.
      expect(duracao).toBeLessThan(1500);
    });

    it('nenhum endpoint de resultado devolve resposta individual', async () => {
      const [indicadores, perguntas, evolucao, municipios] = await Promise.all([
        request(app.getHttpServer()).get(rota('/indicadores')).set(comoAnalista()),
        request(app.getHttpServer()).get(rota('/perguntas')).set(comoAnalista()),
        request(app.getHttpServer()).get(rota('/evolucao')).set(comoAnalista()),
        request(app.getHttpServer()).get(rota('/municipios')).set(comoAnalista()),
      ]);

      const corpo = JSON.stringify([
        indicadores.body,
        perguntas.body,
        evolucao.body,
        municipios.body,
      ]);

      expect(corpo).not.toContain('dispositivo');
      expect(corpo).not.toContain('respostaId');
      expect(corpo).not.toContain('latitude');
      expect(corpo).not.toContain('valorTexto');
    });
  });
});
