import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AuditoriaAcao, PerfilCodigo, PrismaClient, SessaoMotivo } from '@prisma/client';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { SenhaService } from '../src/auth/senha.service';
import { TodasExcecoesFilter } from '../src/common/filters/todas-excecoes.filter';

/**
 * E2E do critério de aceite da Sprint 1, contra banco de verdade:
 * Administrador entra, Analista é bloqueado em rota restrita e as duas
 * tentativas aparecem na auditoria.
 *
 * Exige DATABASE_URL apontando para um banco já migrado (docker compose ou CI).
 */
describe('Autenticação e controle de acesso (e2e)', () => {
  let app: INestApplication;
  const prisma = new PrismaClient();
  const senhas = new SenhaService();

  const marca = Date.now();
  const emailAdmin = `admin.e2e.${marca}@exemplo.br`;
  const emailAnalista = `analista.e2e.${marca}@exemplo.br`;
  const SENHA = 'Senha-De-Teste-2026';

  let idAdmin = '';
  let idAnalista = '';
  let tokenAdmin = '';
  let tokenAnalista = '';
  let refreshAdmin = '';
  let sessaoAnalista = '';

  const cabecalho = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET ??= 'segredo-de-teste-com-32-caracteres-ou-mais';
    process.env.THROTTLE_LIMIT = '5000';

    const senhaHash = await senhas.gerarHash(SENHA);
    const criar = async (nome: string, email: string, perfil: PerfilCodigo) => {
      const usuario = await prisma.usuario.create({
        data: { nome, email, senhaHash, perfil: { connect: { codigo: perfil } } },
        select: { id: true },
      });
      return usuario.id;
    };

    idAdmin = await criar('Admin E2E', emailAdmin, PerfilCodigo.ADMINISTRADOR);
    idAnalista = await criar('Analista E2E', emailAnalista, PerfilCodigo.ANALISTA);

    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new TodasExcecoesFilter());
    await app.init();
  });

  afterAll(async () => {
    await prisma.logAuditoria.deleteMany({ where: { usuarioId: { in: [idAdmin, idAnalista] } } });
    await prisma.sessao.deleteMany({ where: { usuarioId: { in: [idAdmin, idAnalista] } } });
    await prisma.usuario.deleteMany({ where: { id: { in: [idAdmin, idAnalista] } } });
    await prisma.$disconnect();
    await app.close();
  });

  describe('login', () => {
    it('autentica o Administrador', async () => {
      const resposta = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: emailAdmin, senha: SENHA })
        .expect(200);

      expect(resposta.body.perfil).toBe(PerfilCodigo.ADMINISTRADOR);
      expect(resposta.body.accessToken).toBeDefined();
      tokenAdmin = resposta.body.accessToken;
      refreshAdmin = resposta.body.refreshToken;
    });

    it('autentica o Analista', async () => {
      const resposta = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: emailAnalista, senha: SENHA })
        .expect(200);

      expect(resposta.body.perfil).toBe(PerfilCodigo.ANALISTA);
      tokenAnalista = resposta.body.accessToken;

      const sessao = await prisma.sessao.findFirst({
        where: { usuarioId: idAnalista },
        orderBy: { criadaEm: 'desc' },
        select: { id: true },
      });
      sessaoAnalista = sessao!.id;
    });

    it('recusa senha errada com 401 e mensagem genérica', async () => {
      const resposta = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: emailAdmin, senha: 'Senha-Errada-2026' })
        .expect(401);

      expect(resposta.body.mensagem).toBe('Credenciais inválidas.');
    });

    it('responde igual para e-mail inexistente, sem revelar quem existe', async () => {
      const resposta = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: `nao.existe.${marca}@exemplo.br`, senha: 'Senha-Errada-2026' })
        .expect(401);

      expect(resposta.body.mensagem).toBe('Credenciais inválidas.');
    });

    it('recusa campo não declarado no corpo do login', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: emailAdmin, senha: SENHA, perfil: PerfilCodigo.ADMINISTRADOR })
        .expect(400);
    });
  });

  describe('rotas restritas', () => {
    it('o Administrador acessa a lista de usuários', async () => {
      const resposta = await request(app.getHttpServer())
        .get('/api/v1/usuarios')
        .set(cabecalho(tokenAdmin))
        .expect(200);

      expect(Array.isArray(resposta.body.itens)).toBe(true);
      expect(JSON.stringify(resposta.body)).not.toContain('senhaHash');
      expect(JSON.stringify(resposta.body)).not.toContain('scrypt$');
    });

    it('o Analista é bloqueado com 403 na lista de usuários', async () => {
      const resposta = await request(app.getHttpServer())
        .get('/api/v1/usuarios')
        .set(cabecalho(tokenAnalista))
        .expect(403);

      expect(resposta.body.mensagem).toContain('perfil');
    });

    it('o Analista continua bloqueado trocando o id na rota', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/usuarios/${idAdmin}`)
        .set(cabecalho(tokenAnalista))
        .expect(403);

      await request(app.getHttpServer())
        .get(`/api/v1/usuarios/${idAnalista}`)
        .set(cabecalho(tokenAnalista))
        .expect(403);
    });

    it('o Analista não escala privilégio pelo corpo da requisição', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/usuarios/${idAnalista}/perfil`)
        .set(cabecalho(tokenAnalista))
        .send({ perfil: PerfilCodigo.ADMINISTRADOR })
        .expect(403);

      const conferencia = await prisma.usuario.findUnique({
        where: { id: idAnalista },
        select: { perfil: { select: { codigo: true } } },
      });
      expect(conferencia?.perfil.codigo).toBe(PerfilCodigo.ANALISTA);
    });

    it('o Analista é bloqueado na consulta de auditoria', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/auditoria')
        .set(cabecalho(tokenAnalista))
        .expect(403);
    });

    it('rota autenticada sem token responde 401', async () => {
      await request(app.getHttpServer()).get('/api/v1/usuarios').expect(401);
    });

    it('token adulterado responde 401', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/usuarios')
        .set(cabecalho(`${tokenAdmin}x`))
        .expect(401);
    });

    it('a rota pública de municípios continua aberta', async () => {
      await request(app.getHttpServer()).get('/api/v1/municipios?limite=1').expect(200);
    });
  });

  describe('auditoria', () => {
    it('registra o login do Administrador, o do Analista e a tentativa falha', async () => {
      const resposta = await request(app.getHttpServer())
        .get('/api/v1/auditoria?limite=200')
        .set(cabecalho(tokenAdmin))
        .expect(200);

      const doTeste = resposta.body.itens.filter((item: { usuario: { id: string } | null }) =>
        [idAdmin, idAnalista].includes(item.usuario?.id ?? ''),
      );
      const acoes = doTeste.map((item: { acao: AuditoriaAcao }) => item.acao);

      expect(acoes).toContain(AuditoriaAcao.LOGIN);
      expect(acoes).toContain(AuditoriaAcao.LOGIN_FALHA);

      const loginsDoAdmin = doTeste.filter(
        (item: { acao: AuditoriaAcao; usuario: { id: string } | null }) =>
          item.acao === AuditoriaAcao.LOGIN && item.usuario?.id === idAdmin,
      );
      const loginsDoAnalista = doTeste.filter(
        (item: { acao: AuditoriaAcao; usuario: { id: string } | null }) =>
          item.acao === AuditoriaAcao.LOGIN && item.usuario?.id === idAnalista,
      );
      expect(loginsDoAdmin.length).toBeGreaterThanOrEqual(1);
      expect(loginsDoAnalista.length).toBeGreaterThanOrEqual(1);
    });

    it('não guarda senha, token nem hash de dispositivo no detalhe', async () => {
      const registros = await prisma.logAuditoria.findMany({
        where: { usuarioId: { in: [idAdmin, idAnalista] } },
        select: { detalhe: true },
      });

      const texto = JSON.stringify(registros);
      expect(texto).not.toContain(SENHA);
      expect(texto).not.toContain('scrypt$');
      expect(texto).not.toContain(tokenAdmin);
      expect(texto).not.toContain('dispositivo');
    });
  });

  describe('sessão', () => {
    it('devolve o usuário autenticado sem expor o hash da senha', async () => {
      const resposta = await request(app.getHttpServer())
        .get('/api/v1/auth/eu')
        .set(cabecalho(tokenAdmin))
        .expect(200);

      expect(resposta.body.id).toBe(idAdmin);
      expect(resposta.body).not.toHaveProperty('senhaHash');
    });

    it('renova o access token e rotaciona o refresh token', async () => {
      const resposta = await request(app.getHttpServer())
        .post('/api/v1/auth/renovar')
        .send({ refreshToken: refreshAdmin })
        .expect(200);

      expect(resposta.body.refreshToken).not.toBe(refreshAdmin);

      const antigo = await request(app.getHttpServer())
        .post('/api/v1/auth/renovar')
        .send({ refreshToken: refreshAdmin })
        .expect(401);
      expect(antigo.body.mensagem).toBeDefined();

      refreshAdmin = resposta.body.refreshToken;
      tokenAdmin = resposta.body.accessToken;
    });

    it('encerra a sessão parada por inatividade e registra na auditoria', async () => {
      await prisma.sessao.update({
        where: { id: sessaoAnalista },
        data: { ultimaAtividadeEm: new Date(Date.now() - 24 * 60 * 60_000) },
      });

      await request(app.getHttpServer())
        .get('/api/v1/auth/eu')
        .set(cabecalho(tokenAnalista))
        .expect(401);

      const sessao = await prisma.sessao.findUnique({
        where: { id: sessaoAnalista },
        select: { encerradaEm: true, motivoEncerramento: true },
      });
      expect(sessao?.motivoEncerramento).toBe(SessaoMotivo.INATIVIDADE);
      expect(sessao?.encerradaEm).not.toBeNull();

      const expiradas = await prisma.logAuditoria.count({
        where: { usuarioId: idAnalista, acao: AuditoriaAcao.SESSAO_EXPIRADA },
      });
      expect(expiradas).toBeGreaterThanOrEqual(1);
    });

    it('logout encerra a sessão e o token para de valer', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set(cabecalho(tokenAdmin))
        .expect(204);

      await request(app.getHttpServer())
        .get('/api/v1/auth/eu')
        .set(cabecalho(tokenAdmin))
        .expect(401);
    });
  });
});
