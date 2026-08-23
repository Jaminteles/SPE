import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { FormularioStatus, PerfilCodigo, PerguntaTipo, PrismaClient } from '@prisma/client';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { SenhaService } from '../src/auth/senha.service';
import { TodasExcecoesFilter } from '../src/common/filters/todas-excecoes.filter';

/**
 * E2E do critério de aceite da Sprint 3, contra banco de verdade:
 * o formulário publicado gera link e QR Code válidos, e a tentativa de editar
 * uma pergunta depois de publicado é recusada.
 *
 * Cobre também a lógica condicional e a duplicação.
 */
describe('Publicação do formulário (e2e)', () => {
  let app: INestApplication;
  const prisma = new PrismaClient();
  const senhas = new SenhaService();

  const marca = Date.now();
  const emailAdmin = `admin.pub.${marca}@exemplo.br`;
  const emailAnalista = `analista.pub.${marca}@exemplo.br`;
  const SENHA = 'Senha-De-Teste-2026';

  let idAdmin = '';
  let idAnalista = '';
  let tokenAdmin = '';
  let tokenAnalista = '';
  let formularioId = '';
  let copiaId = '';
  let perguntaOrigemId = '';
  let perguntaCondicionadaId = '';
  let alternativaCondicaoId = '';
  let tokenPublico = '';

  const comoAdmin = () => ({ Authorization: `Bearer ${tokenAdmin}` });
  const comoAnalista = () => ({ Authorization: `Bearer ${tokenAnalista}` });
  const rota = (sufixo = '') => `/api/v1/formularios${sufixo}`;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET ??= 'segredo-de-teste-com-32-caracteres-ou-mais';
    process.env.THROTTLE_LIMIT = '5000';
    process.env.COLETA_BASE_URL = 'https://pesquisa.exemplo.br';

    const senhaHash = await senhas.gerarHash(SENHA);
    const criarUsuario = async (nome: string, email: string, perfil: PerfilCodigo) => {
      const usuario = await prisma.usuario.create({
        data: { nome, email, senhaHash, perfil: { connect: { codigo: perfil } } },
        select: { id: true },
      });
      return usuario.id;
    };

    idAdmin = await criarUsuario('Admin Pub', emailAdmin, PerfilCodigo.ADMINISTRADOR);
    idAnalista = await criarUsuario('Analista Pub', emailAnalista, PerfilCodigo.ANALISTA);

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
    await prisma.formulario.deleteMany({ where: { criadoPorId: { in: [idAdmin, idAnalista] } } });
    await prisma.logAuditoria.deleteMany({ where: { usuarioId: { in: [idAdmin, idAnalista] } } });
    await prisma.sessao.deleteMany({ where: { usuarioId: { in: [idAdmin, idAnalista] } } });
    await prisma.usuario.deleteMany({ where: { id: { in: [idAdmin, idAnalista] } } });
    await prisma.$disconnect();
    await app.close();
  });

  describe('montagem com lógica condicional', () => {
    it('monta um formulário com pergunta de origem e alternativas', async () => {
      const criado = await request(app.getHttpServer())
        .post(rota())
        .set(comoAdmin())
        .send({ titulo: `Pesquisa condicional ${marca}` })
        .expect(201);
      formularioId = criado.body.id;
      expect(criado.body.tokenPublico).toBeNull();

      const origem = await request(app.getHttpServer())
        .post(rota(`/${formularioId}/perguntas`))
        .set(comoAdmin())
        .send({ enunciado: 'Você pretende votar?', tipo: PerguntaTipo.UNICA_ESCOLHA })
        .expect(201);
      perguntaOrigemId = origem.body.id;

      const sim = await request(app.getHttpServer())
        .post(rota(`/${formularioId}/perguntas/${perguntaOrigemId}/alternativas`))
        .set(comoAdmin())
        .send({ texto: 'Sim' })
        .expect(201);
      alternativaCondicaoId = sim.body.id;

      await request(app.getHttpServer())
        .post(rota(`/${formularioId}/perguntas/${perguntaOrigemId}/alternativas`))
        .set(comoAdmin())
        .send({ texto: 'Não' })
        .expect(201);
    });

    it('cria pergunta que só aparece quando a alternativa é escolhida', async () => {
      const condicionada = await request(app.getHttpServer())
        .post(rota(`/${formularioId}/perguntas`))
        .set(comoAdmin())
        .send({
          enunciado: 'Em quem você votaria?',
          tipo: PerguntaTipo.UNICA_ESCOLHA,
          condicaoAlternativaId: alternativaCondicaoId,
        })
        .expect(201);

      perguntaCondicionadaId = condicionada.body.id;
      expect(condicionada.body.condicaoAlternativaId).toBe(alternativaCondicaoId);
      expect(condicionada.body.condicaoPerguntaId).toBe(perguntaOrigemId);

      await request(app.getHttpServer())
        .post(rota(`/${formularioId}/perguntas/${perguntaCondicionadaId}/alternativas`))
        .set(comoAdmin())
        .send({ texto: 'Candidato A' })
        .expect(201);
      await request(app.getHttpServer())
        .post(rota(`/${formularioId}/perguntas/${perguntaCondicionadaId}/alternativas`))
        .set(comoAdmin())
        .send({ texto: 'Candidato B' })
        .expect(201);
    });

    it('recusa condição apontando para alternativa de outro formulário', async () => {
      const outro = await request(app.getHttpServer())
        .post(rota())
        .set(comoAdmin())
        .send({ titulo: `Outra pesquisa ${marca}` })
        .expect(201);

      const perguntaDeFora = await request(app.getHttpServer())
        .post(rota(`/${outro.body.id}/perguntas`))
        .set(comoAdmin())
        .send({ enunciado: 'Pergunta de outro formulário', tipo: PerguntaTipo.UNICA_ESCOLHA })
        .expect(201);

      const alternativaDeFora = await request(app.getHttpServer())
        .post(rota(`/${outro.body.id}/perguntas/${perguntaDeFora.body.id}/alternativas`))
        .set(comoAdmin())
        .send({ texto: 'Alternativa de fora' })
        .expect(201);

      await request(app.getHttpServer())
        .post(rota(`/${formularioId}/perguntas`))
        .set(comoAdmin())
        .send({
          enunciado: 'Tentativa de condição cruzada',
          tipo: PerguntaTipo.TEXTO_LIVRE,
          condicaoAlternativaId: alternativaDeFora.body.id,
        })
        .expect(400);

      await request(app.getHttpServer())
        .delete(rota(`/${outro.body.id}`))
        .set(comoAdmin())
        .expect(204);
    });

    it('recusa reordenação que deixaria a dependente antes da origem', async () => {
      await request(app.getHttpServer())
        .patch(rota(`/${formularioId}/perguntas/ordem`))
        .set(comoAdmin())
        .send({ ids: [perguntaCondicionadaId, perguntaOrigemId] })
        .expect(400);
    });

    it('recusa excluir a alternativa que habilita outra pergunta', async () => {
      await request(app.getHttpServer())
        .delete(
          rota(
            `/${formularioId}/perguntas/${perguntaOrigemId}/alternativas/${alternativaCondicaoId}`,
          ),
        )
        .set(comoAdmin())
        .expect(409);
    });

    it('recusa excluir a pergunta da qual outra depende', async () => {
      await request(app.getHttpServer())
        .delete(rota(`/${formularioId}/perguntas/${perguntaOrigemId}`))
        .set(comoAdmin())
        .expect(409);
    });
  });

  describe('ciclo de status', () => {
    it('não gera link antes da publicação', async () => {
      await request(app.getHttpServer())
        .get(rota(`/${formularioId}/acesso`))
        .set(comoAdmin())
        .expect(409);
    });

    it('não encerra formulário que ainda é rascunho', async () => {
      await request(app.getHttpServer())
        .post(rota(`/${formularioId}/encerrar`))
        .set(comoAdmin())
        .expect(409);
    });

    it('publica e passa a ter token público', async () => {
      const publicado = await request(app.getHttpServer())
        .post(rota(`/${formularioId}/publicar`))
        .set(comoAdmin())
        .expect(200);

      expect(publicado.body.status).toBe(FormularioStatus.EM_COLETA);
      expect(publicado.body.tokenPublico).toMatch(/^[A-Za-z0-9_-]{22}$/);
      tokenPublico = publicado.body.tokenPublico;
    });

    it('não publica duas vezes', async () => {
      await request(app.getHttpServer())
        .post(rota(`/${formularioId}/publicar`))
        .set(comoAdmin())
        .expect(409);
    });
  });

  describe('link e QR Code', () => {
    it('devolve link com o token público e QR Code em SVG', async () => {
      const acesso = await request(app.getHttpServer())
        .get(rota(`/${formularioId}/acesso`))
        .set(comoAdmin())
        .expect(200);

      // A base vem da configuração do ambiente; o que importa é o caminho com o token público.
      expect(acesso.body.url.endsWith(`/r/${tokenPublico}`)).toBe(true);
      expect(acesso.body.url.startsWith('http')).toBe(true);
      expect(acesso.body.url).not.toContain(formularioId);
      expect(acesso.body.qrCodeSvg.startsWith('<svg')).toBe(true);
      expect(acesso.body.qrCodeSvg).toContain('viewBox');
      expect(acesso.body.qrCodeSvg).toContain('<path');
      // Matriz real, não um SVG vazio: o desenho tem centenas de comandos.
      expect(acesso.body.qrCodeSvg.length).toBeGreaterThan(500);
    });

    it('o Analista não acessa o link de coleta pela rota de administração', async () => {
      await request(app.getHttpServer())
        .get(rota(`/${formularioId}/acesso`))
        .set(comoAnalista())
        .expect(403);
    });
  });

  describe('imutabilidade depois de publicado', () => {
    it('recusa editar a pergunta', async () => {
      await request(app.getHttpServer())
        .patch(rota(`/${formularioId}/perguntas/${perguntaOrigemId}`))
        .set(comoAdmin())
        .send({ enunciado: 'Enunciado alterado depois da publicação' })
        .expect(409);
    });

    it('recusa mudar a condição', async () => {
      await request(app.getHttpServer())
        .patch(rota(`/${formularioId}/perguntas/${perguntaCondicionadaId}`))
        .set(comoAdmin())
        .send({ condicaoAlternativaId: null })
        .expect(409);
    });

    it('recusa acrescentar e remover pergunta', async () => {
      await request(app.getHttpServer())
        .post(rota(`/${formularioId}/perguntas`))
        .set(comoAdmin())
        .send({ enunciado: 'Pergunta tardia', tipo: PerguntaTipo.TEXTO_LIVRE })
        .expect(409);

      await request(app.getHttpServer())
        .delete(rota(`/${formularioId}/perguntas/${perguntaCondicionadaId}`))
        .set(comoAdmin())
        .expect(409);
    });

    it('o conteúdo continua o mesmo depois das tentativas', async () => {
      const atual = await request(app.getHttpServer())
        .get(rota(`/${formularioId}`))
        .set(comoAdmin())
        .expect(200);

      const origem = atual.body.perguntas.find(
        (pergunta: { id: string }) => pergunta.id === perguntaOrigemId,
      );
      const condicionada = atual.body.perguntas.find(
        (pergunta: { id: string }) => pergunta.id === perguntaCondicionadaId,
      );

      expect(origem.enunciado).toBe('Você pretende votar?');
      expect(condicionada.condicaoAlternativaId).toBe(alternativaCondicaoId);
    });
  });

  describe('duplicação', () => {
    it('o Analista não duplica formulário', async () => {
      await request(app.getHttpServer())
        .post(rota(`/${formularioId}/duplicar`))
        .set(comoAnalista())
        .send({})
        .expect(403);
    });

    it('duplica o publicado como novo rascunho, com a condição remapeada', async () => {
      const copia = await request(app.getHttpServer())
        .post(rota(`/${formularioId}/duplicar`))
        .set(comoAdmin())
        .send({ titulo: `Segunda rodada ${marca}` })
        .expect(201);

      copiaId = copia.body.id;
      expect(copia.body.status).toBe(FormularioStatus.RASCUNHO);
      expect(copia.body.versao).toBe(2);
      expect(copia.body.tokenPublico).toBeNull();

      const completo = await request(app.getHttpServer())
        .get(rota(`/${copiaId}`))
        .set(comoAdmin())
        .expect(200);

      expect(completo.body.perguntas).toHaveLength(2);

      const condicionada = completo.body.perguntas.find(
        (pergunta: { condicaoAlternativaId: string | null }) =>
          pergunta.condicaoAlternativaId !== null,
      );
      const origem = completo.body.perguntas.find(
        (pergunta: { ordem: number }) => pergunta.ordem === 1,
      );

      // A condição aponta para a alternativa da cópia, não para a do original.
      expect(condicionada.condicaoPerguntaId).toBe(origem.id);
      expect(condicionada.condicaoAlternativaId).not.toBe(alternativaCondicaoId);
      expect(origem.alternativas.map((a: { texto: string }) => a.texto)).toEqual(['Sim', 'Não']);
    });

    it('a cópia é editável, ao contrário do original', async () => {
      const perguntas = await request(app.getHttpServer())
        .get(rota(`/${copiaId}`))
        .set(comoAdmin())
        .expect(200);

      await request(app.getHttpServer())
        .patch(rota(`/${copiaId}/perguntas/${perguntas.body.perguntas[0].id}`))
        .set(comoAdmin())
        .send({ enunciado: 'Enunciado revisado na nova rodada' })
        .expect(200);
    });
  });

  describe('encerramento', () => {
    it('encerra a coleta e mantém o link para conferência', async () => {
      const encerrado = await request(app.getHttpServer())
        .post(rota(`/${formularioId}/encerrar`))
        .set(comoAdmin())
        .expect(200);

      expect(encerrado.body.status).toBe(FormularioStatus.ENCERRADO);

      const acesso = await request(app.getHttpServer())
        .get(rota(`/${formularioId}/acesso`))
        .set(comoAdmin())
        .expect(200);
      expect(acesso.body.token).toBe(tokenPublico);
    });
  });
});
