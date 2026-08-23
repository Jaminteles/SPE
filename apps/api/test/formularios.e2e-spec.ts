import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  AuditoriaAcao,
  FormularioStatus,
  PerfilCodigo,
  PerguntaTipo,
  PrismaClient,
} from '@prisma/client';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { SenhaService } from '../src/auth/senha.service';
import { TodasExcecoesFilter } from '../src/common/filters/todas-excecoes.filter';

/**
 * E2E do critério de aceite da Sprint 2, contra banco de verdade:
 * um formulário com pelo menos uma pergunta de cada um dos cinco tipos é
 * criado, editado e recuperado — o mesmo GET que o aplicativo consome.
 */
describe('Formulários (e2e)', () => {
  let app: INestApplication;
  const prisma = new PrismaClient();
  const senhas = new SenhaService();

  const marca = Date.now();
  const emailAdmin = `admin.form.${marca}@exemplo.br`;
  const emailAnalista = `analista.form.${marca}@exemplo.br`;
  const SENHA = 'Senha-De-Teste-2026';

  let idAdmin = '';
  let idAnalista = '';
  let tokenAdmin = '';
  let tokenAnalista = '';
  let formularioId = '';
  const perguntas: Record<string, string> = {};

  const comoAdmin = () => ({ Authorization: `Bearer ${tokenAdmin}` });
  const comoAnalista = () => ({ Authorization: `Bearer ${tokenAnalista}` });
  const rota = (sufixo = '') => `/api/v1/formularios${sufixo}`;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET ??= 'segredo-de-teste-com-32-caracteres-ou-mais';
    process.env.THROTTLE_LIMIT = '5000';

    const senhaHash = await senhas.gerarHash(SENHA);
    const criarUsuario = async (nome: string, email: string, perfil: PerfilCodigo) => {
      const usuario = await prisma.usuario.create({
        data: { nome, email, senhaHash, perfil: { connect: { codigo: perfil } } },
        select: { id: true },
      });
      return usuario.id;
    };

    idAdmin = await criarUsuario('Admin Form', emailAdmin, PerfilCodigo.ADMINISTRADOR);
    idAnalista = await criarUsuario('Analista Form', emailAnalista, PerfilCodigo.ANALISTA);

    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new TodasExcecoesFilter());
    await app.init();

    const entrar = async (email: string) => {
      const resposta = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, senha: SENHA })
        .expect(200);
      return resposta.body.accessToken as string;
    };

    tokenAdmin = await entrar(emailAdmin);
    tokenAnalista = await entrar(emailAnalista);
  });

  afterAll(async () => {
    if (formularioId) {
      await prisma.formulario.deleteMany({ where: { id: formularioId } });
    }
    await prisma.formulario.deleteMany({ where: { criadoPorId: { in: [idAdmin, idAnalista] } } });
    await prisma.logAuditoria.deleteMany({ where: { usuarioId: { in: [idAdmin, idAnalista] } } });
    await prisma.sessao.deleteMany({ where: { usuarioId: { in: [idAdmin, idAnalista] } } });
    await prisma.usuario.deleteMany({ where: { id: { in: [idAdmin, idAnalista] } } });
    await prisma.$disconnect();
    await app.close();
  });

  describe('controle de acesso', () => {
    it('o Analista é bloqueado em todas as rotas de formulário', async () => {
      await request(app.getHttpServer()).get(rota()).set(comoAnalista()).expect(403);
      await request(app.getHttpServer())
        .post(rota())
        .set(comoAnalista())
        .send({ titulo: 'Tentativa do analista' })
        .expect(403);
    });

    it('rota de formulário sem token responde 401', async () => {
      await request(app.getHttpServer()).get(rota()).expect(401);
    });
  });

  describe('criação e montagem', () => {
    it('cria o formulário em rascunho', async () => {
      const resposta = await request(app.getHttpServer())
        .post(rota())
        .set(comoAdmin())
        .send({
          titulo: `Intenção de voto ${marca}`,
          descricao: 'Rodada de teste automatizado.',
          vigenciaInicio: '2026-09-01T00:00:00.000Z',
          vigenciaFim: '2026-09-30T23:59:59.000Z',
        })
        .expect(201);

      expect(resposta.body.status).toBe(FormularioStatus.RASCUNHO);
      expect(resposta.body.versao).toBe(1);
      formularioId = resposta.body.id;
    });

    it('recusa vigência com fim antes do início', async () => {
      await request(app.getHttpServer())
        .post(rota())
        .set(comoAdmin())
        .send({
          titulo: 'Vigência invertida',
          vigenciaInicio: '2026-09-30T00:00:00.000Z',
          vigenciaFim: '2026-09-01T00:00:00.000Z',
        })
        .expect(400);
    });

    it('recusa campo não declarado no corpo', async () => {
      await request(app.getHttpServer())
        .post(rota())
        .set(comoAdmin())
        .send({ titulo: 'Com status forçado', status: FormularioStatus.EM_COLETA })
        .expect(400);
    });

    it('cria uma pergunta de cada um dos cinco tipos', async () => {
      const criar = async (corpo: Record<string, unknown>) => {
        const resposta = await request(app.getHttpServer())
          .post(rota(`/${formularioId}/perguntas`))
          .set(comoAdmin())
          .send(corpo)
          .expect(201);
        return resposta.body;
      };

      const unica = await criar({
        enunciado: 'Em quem você votaria hoje?',
        tipo: PerguntaTipo.UNICA_ESCOLHA,
      });
      const multipla = await criar({
        enunciado: 'Quais temas mais importam para você?',
        tipo: PerguntaTipo.MULTIPLA_ESCOLHA,
      });
      const escala = await criar({
        enunciado: 'Que nota você dá para a gestão atual?',
        tipo: PerguntaTipo.ESCALA,
        escalaMinimo: 0,
        escalaMaximo: 10,
        escalaRotuloMinimo: 'Péssima',
        escalaRotuloMaximo: 'Ótima',
      });
      const texto = await criar({
        enunciado: 'Quer comentar alguma coisa?',
        tipo: PerguntaTipo.TEXTO_LIVRE,
        obrigatoria: false,
      });
      const numero = await criar({
        enunciado: 'Há quantos anos você mora no município?',
        tipo: PerguntaTipo.NUMERO,
      });

      Object.assign(perguntas, {
        unica: unica.id,
        multipla: multipla.id,
        escala: escala.id,
        texto: texto.id,
        numero: numero.id,
      });

      expect([unica.ordem, multipla.ordem, escala.ordem, texto.ordem, numero.ordem]).toEqual([
        1, 2, 3, 4, 5,
      ]);
      expect(escala.escalaMinimo).toBe(0);
      expect(escala.escalaMaximo).toBe(10);
      expect(texto.obrigatoria).toBe(false);
      expect(numero.escalaMinimo).toBeNull();
    });

    it('recusa escala sem faixa', async () => {
      await request(app.getHttpServer())
        .post(rota(`/${formularioId}/perguntas`))
        .set(comoAdmin())
        .send({ enunciado: 'Nota sem faixa', tipo: PerguntaTipo.ESCALA })
        .expect(400);
    });

    it('acrescenta alternativas às perguntas de escolha', async () => {
      const criarAlternativa = async (perguntaId: string, texto: string) => {
        const resposta = await request(app.getHttpServer())
          .post(rota(`/${formularioId}/perguntas/${perguntaId}/alternativas`))
          .set(comoAdmin())
          .send({ texto })
          .expect(201);
        return resposta.body;
      };

      const primeira = await criarAlternativa(perguntas.unica, 'Candidato A');
      const segunda = await criarAlternativa(perguntas.unica, 'Candidato B');
      await criarAlternativa(perguntas.unica, 'Nenhum deles');
      await criarAlternativa(perguntas.multipla, 'Saúde');
      await criarAlternativa(perguntas.multipla, 'Educação');

      expect(primeira.ordem).toBe(1);
      expect(segunda.ordem).toBe(2);
    });

    it('recusa alternativa em pergunta que não é de escolha', async () => {
      await request(app.getHttpServer())
        .post(rota(`/${formularioId}/perguntas/${perguntas.texto}/alternativas`))
        .set(comoAdmin())
        .send({ texto: 'Não deveria existir' })
        .expect(400);
    });
  });

  describe('edição', () => {
    it('edita o formulário', async () => {
      const resposta = await request(app.getHttpServer())
        .patch(rota(`/${formularioId}`))
        .set(comoAdmin())
        .send({ descricao: 'Descrição revisada.' })
        .expect(200);

      expect(resposta.body.descricao).toBe('Descrição revisada.');
    });

    it('edita o enunciado e a obrigatoriedade da pergunta', async () => {
      const resposta = await request(app.getHttpServer())
        .patch(rota(`/${formularioId}/perguntas/${perguntas.numero}`))
        .set(comoAdmin())
        .send({ enunciado: 'Há quantos anos você mora neste município?', obrigatoria: false })
        .expect(200);

      expect(resposta.body.obrigatoria).toBe(false);
      expect(resposta.body.enunciado).toContain('neste município');
    });

    it('não deixa mudar o tipo da pergunta pelo corpo', async () => {
      await request(app.getHttpServer())
        .patch(rota(`/${formularioId}/perguntas/${perguntas.numero}`))
        .set(comoAdmin())
        .send({ tipo: PerguntaTipo.ESCALA })
        .expect(400);
    });

    it('reordena as perguntas', async () => {
      const novaOrdem = [
        perguntas.escala,
        perguntas.unica,
        perguntas.multipla,
        perguntas.numero,
        perguntas.texto,
      ];

      const resposta = await request(app.getHttpServer())
        .patch(rota(`/${formularioId}/perguntas/ordem`))
        .set(comoAdmin())
        .send({ ids: novaOrdem })
        .expect(200);

      expect(resposta.body.map((pergunta: { id: string }) => pergunta.id)).toEqual(novaOrdem);
      expect(resposta.body.map((pergunta: { ordem: number }) => pergunta.ordem)).toEqual([
        1, 2, 3, 4, 5,
      ]);
    });

    it('recusa reordenação com lista incompleta', async () => {
      await request(app.getHttpServer())
        .patch(rota(`/${formularioId}/perguntas/ordem`))
        .set(comoAdmin())
        .send({ ids: [perguntas.unica] })
        .expect(400);
    });

    it('reordena as alternativas', async () => {
      const atual = await request(app.getHttpServer())
        .get(rota(`/${formularioId}`))
        .set(comoAdmin())
        .expect(200);

      const unica = atual.body.perguntas.find(
        (pergunta: { id: string }) => pergunta.id === perguntas.unica,
      );
      const invertida = [...unica.alternativas]
        .reverse()
        .map((alternativa: { id: string }) => alternativa.id);

      const resposta = await request(app.getHttpServer())
        .patch(rota(`/${formularioId}/perguntas/${perguntas.unica}/alternativas/ordem`))
        .set(comoAdmin())
        .send({ ids: invertida })
        .expect(200);

      expect(resposta.body.map((alternativa: { id: string }) => alternativa.id)).toEqual(invertida);
    });

    it('remove uma alternativa e fecha o buraco na numeração', async () => {
      const antes = await request(app.getHttpServer())
        .get(rota(`/${formularioId}`))
        .set(comoAdmin())
        .expect(200);
      const unica = antes.body.perguntas.find(
        (pergunta: { id: string }) => pergunta.id === perguntas.unica,
      );
      const alvo = unica.alternativas[0].id;

      await request(app.getHttpServer())
        .delete(rota(`/${formularioId}/perguntas/${perguntas.unica}/alternativas/${alvo}`))
        .set(comoAdmin())
        .expect(204);

      const depois = await request(app.getHttpServer())
        .get(rota(`/${formularioId}`))
        .set(comoAdmin())
        .expect(200);
      const atualizada = depois.body.perguntas.find(
        (pergunta: { id: string }) => pergunta.id === perguntas.unica,
      );

      expect(atualizada.alternativas).toHaveLength(2);
      expect(atualizada.alternativas.map((a: { ordem: number }) => a.ordem)).toEqual([1, 2]);
    });

    it('responde 404 para pergunta de outro formulário', async () => {
      const outro = await request(app.getHttpServer())
        .post(rota())
        .set(comoAdmin())
        .send({ titulo: `Outro formulário ${marca}` })
        .expect(201);

      await request(app.getHttpServer())
        .patch(rota(`/${outro.body.id}/perguntas/${perguntas.unica}`))
        .set(comoAdmin())
        .send({ enunciado: 'Tentativa de invasão de contexto' })
        .expect(404);

      await request(app.getHttpServer())
        .delete(rota(`/${outro.body.id}`))
        .set(comoAdmin())
        .expect(204);
    });
  });

  describe('recuperação pelo aplicativo', () => {
    it('devolve o formulário completo, ordenado e sem dado interno', async () => {
      const resposta = await request(app.getHttpServer())
        .get(rota(`/${formularioId}`))
        .set(comoAdmin())
        .expect(200);

      const tipos = resposta.body.perguntas.map(
        (pergunta: { tipo: PerguntaTipo }) => pergunta.tipo,
      );
      expect(new Set(tipos)).toEqual(
        new Set([
          PerguntaTipo.UNICA_ESCOLHA,
          PerguntaTipo.MULTIPLA_ESCOLHA,
          PerguntaTipo.ESCALA,
          PerguntaTipo.TEXTO_LIVRE,
          PerguntaTipo.NUMERO,
        ]),
      );
      expect(resposta.body.totalPerguntas).toBe(5);
      expect(resposta.body.perguntas.map((p: { ordem: number }) => p.ordem)).toEqual([
        1, 2, 3, 4, 5,
      ]);
      expect(JSON.stringify(resposta.body)).not.toContain('criadoPorId');
      expect(JSON.stringify(resposta.body)).not.toContain('formularioId');
    });

    it('lista formulários com a contagem de perguntas', async () => {
      const resposta = await request(app.getHttpServer())
        .get(rota('?status=RASCUNHO&limite=200'))
        .set(comoAdmin())
        .expect(200);

      const nosso = resposta.body.itens.find(
        (formulario: { id: string }) => formulario.id === formularioId,
      );
      expect(nosso.totalPerguntas).toBe(5);
    });
  });

  describe('publicação e imutabilidade', () => {
    it('publica o formulário completo', async () => {
      const resposta = await request(app.getHttpServer())
        .post(rota(`/${formularioId}/publicar`))
        .set(comoAdmin())
        .expect(200);

      expect(resposta.body.status).toBe(FormularioStatus.EM_COLETA);
      expect(resposta.body.publicadoEm).not.toBeNull();
    });

    it('recusa qualquer edição depois da publicação', async () => {
      await request(app.getHttpServer())
        .patch(rota(`/${formularioId}`))
        .set(comoAdmin())
        .send({ titulo: 'Título alterado depois da coleta' })
        .expect(409);

      await request(app.getHttpServer())
        .post(rota(`/${formularioId}/perguntas`))
        .set(comoAdmin())
        .send({ enunciado: 'Pergunta tardia', tipo: PerguntaTipo.TEXTO_LIVRE })
        .expect(409);

      await request(app.getHttpServer())
        .patch(rota(`/${formularioId}/perguntas/${perguntas.unica}`))
        .set(comoAdmin())
        .send({ enunciado: 'Enunciado alterado depois da coleta' })
        .expect(409);

      await request(app.getHttpServer())
        .delete(rota(`/${formularioId}/perguntas/${perguntas.unica}`))
        .set(comoAdmin())
        .expect(409);

      await request(app.getHttpServer())
        .delete(rota(`/${formularioId}`))
        .set(comoAdmin())
        .expect(409);
    });

    it('encerra a coleta', async () => {
      const resposta = await request(app.getHttpServer())
        .post(rota(`/${formularioId}/encerrar`))
        .set(comoAdmin())
        .expect(200);

      expect(resposta.body.status).toBe(FormularioStatus.ENCERRADO);
      expect(resposta.body.encerradoEm).not.toBeNull();
    });

    it('registra criação, publicação e encerramento na auditoria', async () => {
      const acoes = await prisma.logAuditoria.findMany({
        where: { entidadeId: formularioId, usuarioId: idAdmin },
        select: { acao: true },
      });
      const registradas = acoes.map((registro) => registro.acao);

      expect(registradas).toContain(AuditoriaAcao.FORMULARIO_CRIADO);
      expect(registradas).toContain(AuditoriaAcao.FORMULARIO_PUBLICADO);
      expect(registradas).toContain(AuditoriaAcao.COLETA_ENCERRADA);
    });
  });
});
