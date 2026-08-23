import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PerfilCodigo, PerguntaTipo, PrismaClient, RespostaStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { SenhaService } from '../src/auth/senha.service';
import { TodasExcecoesFilter } from '../src/common/filters/todas-excecoes.filter';

/**
 * E2E do critério de aceite da Sprint 4, contra banco de verdade:
 * uma resposta completa é enviada e persistida com município e data/hora.
 *
 * A retomada do preenchimento é do aplicativo (expo-sqlite) e está coberta por
 * teste próprio lá; aqui garante-se o lado do servidor, incluindo o reenvio
 * idempotente que o app usa quando a conexão falha.
 */
describe('Coleta pública (e2e)', () => {
  let app: INestApplication;
  const prisma = new PrismaClient();
  const senhas = new SenhaService();

  const marca = Date.now();
  const emailAdmin = `admin.coleta.${marca}@exemplo.br`;
  const SENHA = 'Senha-De-Teste-2026';
  const CODIGO_SALVADOR = 2927408;

  let idAdmin = '';
  let tokenAdmin = '';
  let formularioId = '';
  let tokenPublico = '';
  let perguntaVoto = '';
  let perguntaCandidato = '';
  let perguntaNota = '';
  let perguntaComentario = '';
  let alternativaSim = '';
  let alternativaNao = '';
  let alternativaCandidato = '';

  const comoAdmin = () => ({ Authorization: `Bearer ${tokenAdmin}` });
  const coleta = (sufixo = '') => `/api/v1/coleta/${tokenPublico}${sufixo}`;

  const pacote = (itens: unknown[], ajustes: Record<string, unknown> = {}) => ({
    respostaId: randomUUID(),
    consentimento: true,
    consentimentoEm: new Date(Date.now() - 60_000).toISOString(),
    municipioCodigoIbge: CODIGO_SALVADOR,
    dispositivoId: `dispositivo-${randomUUID()}`,
    coletadoEm: new Date().toISOString(),
    itens,
    ...ajustes,
  });

  beforeAll(async () => {
    const senhaHash = await senhas.gerarHash(SENHA);
    const usuario = await prisma.usuario.create({
      data: {
        nome: 'Admin Coleta',
        email: emailAdmin,
        senhaHash,
        perfil: { connect: { codigo: PerfilCodigo.ADMINISTRADOR } },
      },
      select: { id: true },
    });
    idAdmin = usuario.id;

    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new TodasExcecoesFilter());
    await app.init();

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: emailAdmin, senha: SENHA })
      .expect(200);
    tokenAdmin = login.body.accessToken;

    // Monta e publica um formulário completo, pela própria API de administração.
    const criado = await request(app.getHttpServer())
      .post('/api/v1/formularios')
      .set(comoAdmin())
      .send({ titulo: `Pesquisa de coleta ${marca}` })
      .expect(201);
    formularioId = criado.body.id;

    const criarPergunta = async (corpo: Record<string, unknown>) => {
      const resposta = await request(app.getHttpServer())
        .post(`/api/v1/formularios/${formularioId}/perguntas`)
        .set(comoAdmin())
        .send(corpo)
        .expect(201);
      return resposta.body.id as string;
    };
    const criarAlternativa = async (perguntaId: string, texto: string) => {
      const resposta = await request(app.getHttpServer())
        .post(`/api/v1/formularios/${formularioId}/perguntas/${perguntaId}/alternativas`)
        .set(comoAdmin())
        .send({ texto })
        .expect(201);
      return resposta.body.id as string;
    };

    perguntaVoto = await criarPergunta({
      enunciado: 'Você pretende votar?',
      tipo: PerguntaTipo.UNICA_ESCOLHA,
    });
    alternativaSim = await criarAlternativa(perguntaVoto, 'Sim');
    alternativaNao = await criarAlternativa(perguntaVoto, 'Não');

    perguntaCandidato = await criarPergunta({
      enunciado: 'Em quem você votaria?',
      tipo: PerguntaTipo.UNICA_ESCOLHA,
      condicaoAlternativaId: alternativaSim,
    });
    alternativaCandidato = await criarAlternativa(perguntaCandidato, 'Candidato A');
    await criarAlternativa(perguntaCandidato, 'Candidato B');

    perguntaNota = await criarPergunta({
      enunciado: 'Que nota você dá para a gestão?',
      tipo: PerguntaTipo.ESCALA,
      escalaMinimo: 0,
      escalaMaximo: 10,
    });

    perguntaComentario = await criarPergunta({
      enunciado: 'Quer comentar alguma coisa?',
      tipo: PerguntaTipo.TEXTO_LIVRE,
      obrigatoria: false,
    });

    const publicado = await request(app.getHttpServer())
      .post(`/api/v1/formularios/${formularioId}/publicar`)
      .set(comoAdmin())
      .expect(200);
    tokenPublico = publicado.body.tokenPublico;
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
    await prisma.formulario.deleteMany({ where: { criadoPorId: idAdmin } });
    await prisma.logAuditoria.deleteMany({ where: { usuarioId: idAdmin } });
    await prisma.sessao.deleteMany({ where: { usuarioId: idAdmin } });
    await prisma.usuario.deleteMany({ where: { id: idAdmin } });
    await prisma.$disconnect();
    await app.close();
  });

  describe('abertura pelo link público', () => {
    it('abre o formulário sem token de autenticação', async () => {
      const resposta = await request(app.getHttpServer()).get(coleta()).expect(200);

      expect(resposta.body.titulo).toContain('Pesquisa de coleta');
      expect(resposta.body.perguntas).toHaveLength(4);
      expect(resposta.body.perguntas[1].condicaoAlternativaId).toBe(alternativaSim);
    });

    it('não vaza dado administrativo no formulário público', async () => {
      const resposta = await request(app.getHttpServer()).get(coleta()).expect(200);
      const corpo = JSON.stringify(resposta.body);

      expect(corpo).not.toContain(formularioId);
      expect(corpo).not.toContain('criadoPor');
      expect(corpo).not.toContain('status');
      expect(corpo).not.toContain('totalPerguntas');
    });

    it('recusa token com formato inválido antes de consultar o banco', async () => {
      await request(app.getHttpServer()).get('/api/v1/coleta/token-invalido').expect(400);
      await request(app.getHttpServer())
        .get('/api/v1/coleta/' + 'x'.repeat(80))
        .expect(400);
    });

    it('travessia de caminho não alcança rota administrativa', async () => {
      // O caminho normaliza para /api/v1/formularios, que exige autenticação.
      await request(app.getHttpServer()).get('/api/v1/coleta/../formularios').expect(401);
    });

    it('responde 404 para token bem formado mas inexistente', async () => {
      await request(app.getHttpServer()).get('/api/v1/coleta/AAAAAAAAAAAAAAAAAAAAAA').expect(404);
    });
  });

  describe('envio de resposta', () => {
    it('grava resposta completa com município e data/hora', async () => {
      const enviado = pacote([
        { perguntaId: perguntaVoto, alternativaId: alternativaSim },
        { perguntaId: perguntaCandidato, alternativaId: alternativaCandidato },
        { perguntaId: perguntaNota, valorNumero: 8 },
        { perguntaId: perguntaComentario, valorTexto: 'Comentário livre do respondente.' },
      ]);

      const resposta = await request(app.getHttpServer())
        .post(coleta('/respostas'))
        .send(enviado)
        .expect(201);

      expect(resposta.body.protocolo).toBe(enviado.respostaId);
      expect(resposta.body.status).toBe(RespostaStatus.VALIDA);
      expect(resposta.body.recebidoEm).toBeDefined();

      const gravada = await prisma.resposta.findUnique({
        where: { id: enviado.respostaId },
        select: {
          municipioCodigoIbge: true,
          coletadoEm: true,
          recebidoEm: true,
          consentimentoEm: true,
          status: true,
          dispositivoHash: true,
          latitude: true,
          itens: { select: { perguntaId: true, alternativaId: true, valorNumero: true } },
        },
      });

      expect(gravada?.municipioCodigoIbge).toBe(CODIGO_SALVADOR);
      expect(gravada?.coletadoEm).toBeInstanceOf(Date);
      expect(gravada?.recebidoEm).toBeInstanceOf(Date);
      expect(gravada?.consentimentoEm).toBeInstanceOf(Date);
      expect(gravada?.itens).toHaveLength(4);
      expect(gravada?.latitude).toBeNull();
    });

    it('guarda o dispositivo apenas como hash, e nunca o devolve', async () => {
      const enviado = pacote([
        { perguntaId: perguntaVoto, alternativaId: alternativaNao },
        { perguntaId: perguntaNota, valorNumero: 3 },
      ]);

      const resposta = await request(app.getHttpServer())
        .post(coleta('/respostas'))
        .send(enviado)
        .expect(201);

      expect(JSON.stringify(resposta.body)).not.toContain(enviado.dispositivoId);
      expect(JSON.stringify(resposta.body)).not.toContain('dispositivo');

      const gravada = await prisma.resposta.findUnique({
        where: { id: enviado.respostaId },
        select: { dispositivoHash: true },
      });
      expect(gravada?.dispositivoHash).toHaveLength(64);
      expect(gravada?.dispositivoHash).not.toContain(enviado.dispositivoId);
    });

    it('aceita geolocalização opcional', async () => {
      const enviado = pacote(
        [
          { perguntaId: perguntaVoto, alternativaId: alternativaNao },
          { perguntaId: perguntaNota, valorNumero: 5 },
        ],
        { latitude: -12.9714, longitude: -38.5014 },
      );

      await request(app.getHttpServer()).post(coleta('/respostas')).send(enviado).expect(201);

      const gravada = await prisma.resposta.findUnique({
        where: { id: enviado.respostaId },
        select: { latitude: true, longitude: true },
      });
      expect(Number(gravada?.latitude)).toBeCloseTo(-12.9714, 4);
      expect(Number(gravada?.longitude)).toBeCloseTo(-38.5014, 4);
    });

    it('reenvio do mesmo pacote é idempotente', async () => {
      const enviado = pacote([
        { perguntaId: perguntaVoto, alternativaId: alternativaNao },
        { perguntaId: perguntaNota, valorNumero: 6 },
      ]);

      const primeira = await request(app.getHttpServer())
        .post(coleta('/respostas'))
        .send(enviado)
        .expect(201);
      const segunda = await request(app.getHttpServer())
        .post(coleta('/respostas'))
        .send(enviado)
        .expect(201);

      expect(segunda.body.protocolo).toBe(primeira.body.protocolo);
      expect(segunda.body.recebidoEm).toBe(primeira.body.recebidoEm);

      const total = await prisma.resposta.count({ where: { id: enviado.respostaId } });
      expect(total).toBe(1);
    });

    it('recusa segunda resposta do mesmo aparelho na mesma pesquisa', async () => {
      const dispositivoId = `dispositivo-${randomUUID()}`;
      const itens = [
        { perguntaId: perguntaVoto, alternativaId: alternativaNao },
        { perguntaId: perguntaNota, valorNumero: 4 },
      ];

      await request(app.getHttpServer())
        .post(coleta('/respostas'))
        .send(pacote(itens, { dispositivoId }))
        .expect(201);

      await request(app.getHttpServer())
        .post(coleta('/respostas'))
        .send(pacote(itens, { dispositivoId }))
        .expect(409);
    });
  });

  describe('validação e privacidade', () => {
    it('recusa envio sem aceite do consentimento', async () => {
      await request(app.getHttpServer())
        .post(coleta('/respostas'))
        .send(
          pacote(
            [
              { perguntaId: perguntaVoto, alternativaId: alternativaNao },
              { perguntaId: perguntaNota, valorNumero: 5 },
            ],
            { consentimento: false },
          ),
        )
        .expect(400);
    });

    it('recusa campo não declarado, inclusive dado pessoal', async () => {
      await request(app.getHttpServer())
        .post(coleta('/respostas'))
        .send(
          pacote(
            [
              { perguntaId: perguntaVoto, alternativaId: alternativaNao },
              { perguntaId: perguntaNota, valorNumero: 5 },
            ],
            { nome: 'Fulano de Tal', cpf: '000.000.000-00', telefone: '71999999999' },
          ),
        )
        .expect(400);
    });

    it('recusa pergunta obrigatória em branco', async () => {
      await request(app.getHttpServer())
        .post(coleta('/respostas'))
        .send(pacote([{ perguntaId: perguntaVoto, alternativaId: alternativaNao }]))
        .expect(400);
    });

    it('recusa resposta em pergunta que a condição não habilitou', async () => {
      await request(app.getHttpServer())
        .post(coleta('/respostas'))
        .send(
          pacote([
            { perguntaId: perguntaVoto, alternativaId: alternativaNao },
            { perguntaId: perguntaCandidato, alternativaId: alternativaCandidato },
            { perguntaId: perguntaNota, valorNumero: 5 },
          ]),
        )
        .expect(400);
    });

    it('recusa nota fora da faixa da escala', async () => {
      await request(app.getHttpServer())
        .post(coleta('/respostas'))
        .send(
          pacote([
            { perguntaId: perguntaVoto, alternativaId: alternativaNao },
            { perguntaId: perguntaNota, valorNumero: 99 },
          ]),
        )
        .expect(400);
    });

    it('recusa município fora da base do IBGE', async () => {
      await request(app.getHttpServer())
        .post(coleta('/respostas'))
        .send(
          pacote(
            [
              { perguntaId: perguntaVoto, alternativaId: alternativaNao },
              { perguntaId: perguntaNota, valorNumero: 5 },
            ],
            { municipioCodigoIbge: 9999999 },
          ),
        )
        .expect(400);
    });

    it('nenhuma resposta individual é exposta por rota pública', async () => {
      const gravadas = await prisma.resposta.findMany({
        where: { formularioId },
        select: { id: true },
        take: 1,
      });

      await request(app.getHttpServer())
        .get(`/api/v1/coleta/${tokenPublico}/respostas/${gravadas[0].id}`)
        .expect(404);
    });
  });

  describe('pesquisa encerrada', () => {
    it('deixa de aceitar respostas depois do encerramento', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/formularios/${formularioId}/encerrar`)
        .set(comoAdmin())
        .expect(200);

      await request(app.getHttpServer()).get(coleta()).expect(409);

      await request(app.getHttpServer())
        .post(coleta('/respostas'))
        .send(
          pacote([
            { perguntaId: perguntaVoto, alternativaId: alternativaNao },
            { perguntaId: perguntaNota, valorNumero: 5 },
          ]),
        )
        .expect(409);
    });
  });
  // Fica por último de propósito: esgota a cota de envios do endereço.
  describe('rate limit da rota pública', () => {
    it('corta rajada de envios do mesmo endereço', async () => {
      const enviar = () =>
        request(app.getHttpServer())
          .post(coleta('/respostas'))
          .send(
            pacote([
              { perguntaId: perguntaVoto, alternativaId: alternativaNao },
              { perguntaId: perguntaNota, valorNumero: 5 },
            ]),
          );

      const limite = Number(process.env.COLETA_THROTTLE_LIMITE_ENVIO);
      const status: number[] = [];
      for (let tentativa = 0; tentativa < limite + 8; tentativa += 1) {
        const resposta = await enviar();
        status.push(resposta.status);
      }

      expect(status).toContain(429);
      expect(status.filter((codigo) => codigo === 429).length).toBeGreaterThanOrEqual(3);
    });
  });
});
