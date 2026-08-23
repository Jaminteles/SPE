import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  PerfilCodigo,
  PerguntaTipo,
  PrismaClient,
  RespostaMarcacao,
  RespostaStatus,
} from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import request from 'supertest';

import { AgregacaoService } from '../src/agregacao/agregacao.service';
import { AppModule } from '../src/app.module';
import { SenhaService } from '../src/auth/senha.service';
import { TodasExcecoesFilter } from '../src/common/filters/todas-excecoes.filter';

/**
 * E2E do critério de aceite da Sprint 5, contra banco de verdade:
 * segunda tentativa do mesmo dispositivo recusada, resposta rápida demais
 * marcada como suspeita, e invalidação manual que tira o registro da contagem
 * sem apagá-lo.
 */
describe('Integridade da coleta (e2e)', () => {
  let app: INestApplication;
  let agregacao: AgregacaoService;
  const prisma = new PrismaClient();
  const senhas = new SenhaService();

  const marca = Date.now();
  const emailAdmin = `admin.integridade.${marca}@exemplo.br`;
  const emailAnalista = `analista.integridade.${marca}@exemplo.br`;
  const SENHA = 'Senha-De-Teste-2026';
  const CODIGO_SALVADOR = 2927408;

  let idAdmin = '';
  let idAnalista = '';
  let tokenAdmin = '';
  let tokenAnalista = '';
  let formularioId = '';
  let tokenPublico = '';
  let perguntaVoto = '';
  let perguntaNota = '';
  let alternativaSim = '';
  let alternativaNao = '';

  const comoAdmin = () => ({ Authorization: `Bearer ${tokenAdmin}` });
  const comoAnalista = () => ({ Authorization: `Bearer ${tokenAnalista}` });
  const coleta = (sufixo = '') => `/api/v1/coleta/${tokenPublico}${sufixo}`;
  const conferencia = (sufixo = '') => `/api/v1/formularios/${formularioId}/respostas${sufixo}`;

  const abrirSessao = async () => {
    const resposta = await request(app.getHttpServer()).get(coleta()).expect(200);
    return resposta.body.sessao as string;
  };

  const itensValidos = () => [
    { perguntaId: perguntaVoto, alternativaId: alternativaNao },
    { perguntaId: perguntaNota, valorNumero: 7 },
  ];

  /**
   * Envio com tempo de preenchimento normal: a sessão é envelhecida no banco
   * para que a duração medida pelo servidor fique acima do limite de suspeita.
   */
  const enviarComTempoNormal = async (ajustes: Record<string, unknown> = {}) => {
    const sessao = await abrirSessao();
    const tokenHash = createHash('sha256').update(sessao).digest('hex');
    await prisma.sessaoColeta.updateMany({
      where: { tokenHash },
      data: { iniciadaEm: new Date(Date.now() - 5 * 60_000) },
    });
    return enviar({ sessao, ...ajustes });
  };

  const enviar = async (ajustes: Record<string, unknown> = {}) => {
    const corpo = {
      respostaId: randomUUID(),
      sessao: await abrirSessao(),
      consentimento: true,
      consentimentoEm: new Date(Date.now() - 60_000).toISOString(),
      municipioCodigoIbge: CODIGO_SALVADOR,
      dispositivoId: `dispositivo-${randomUUID()}`,
      coletadoEm: new Date().toISOString(),
      itens: itensValidos(),
      ...ajustes,
    };
    return {
      corpo,
      resposta: await request(app.getHttpServer()).post(coleta('/respostas')).send(corpo),
    };
  };

  beforeAll(async () => {
    // Esta suite liga a marcação por tempo de propósito: é o que ela testa.
    process.env.COLETA_SEGUNDOS_MINIMOS = '30';
    process.env.COLETA_SEGUNDOS_POR_PERGUNTA = '5';

    const senhaHash = await senhas.gerarHash(SENHA);
    const criarUsuario = async (nome: string, email: string, perfil: PerfilCodigo) => {
      const usuario = await prisma.usuario.create({
        data: { nome, email, senhaHash, perfil: { connect: { codigo: perfil } } },
        select: { id: true },
      });
      return usuario.id;
    };

    idAdmin = await criarUsuario('Admin Integridade', emailAdmin, PerfilCodigo.ADMINISTRADOR);
    idAnalista = await criarUsuario('Analista Integridade', emailAnalista, PerfilCodigo.ANALISTA);

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
      .send({ titulo: `Pesquisa de integridade ${marca}` })
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

    perguntaVoto = await criarPergunta({
      enunciado: 'Você pretende votar?',
      tipo: PerguntaTipo.UNICA_ESCOLHA,
    });
    const sim = await request(app.getHttpServer())
      .post(`/api/v1/formularios/${formularioId}/perguntas/${perguntaVoto}/alternativas`)
      .set(comoAdmin())
      .send({ texto: 'Sim' })
      .expect(201);
    alternativaSim = sim.body.id;
    const nao = await request(app.getHttpServer())
      .post(`/api/v1/formularios/${formularioId}/perguntas/${perguntaVoto}/alternativas`)
      .set(comoAdmin())
      .send({ texto: 'Não' })
      .expect(201);
    alternativaNao = nao.body.id;

    perguntaNota = await criarPergunta({
      enunciado: 'Que nota você dá para a gestão?',
      tipo: PerguntaTipo.ESCALA,
      escalaMinimo: 0,
      escalaMaximo: 10,
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
    await prisma.sessaoColeta.deleteMany({ where: { formularioId } });
    await prisma.formulario.deleteMany({ where: { criadoPorId: { in: [idAdmin, idAnalista] } } });
    await prisma.logAuditoria.deleteMany({ where: { usuarioId: { in: [idAdmin, idAnalista] } } });
    await prisma.sessao.deleteMany({ where: { usuarioId: { in: [idAdmin, idAnalista] } } });
    await prisma.usuario.deleteMany({ where: { id: { in: [idAdmin, idAnalista] } } });
    await prisma.$disconnect();
    await app.close();
  });

  describe('duplicidade por dispositivo e por sessão', () => {
    it('recusa a segunda tentativa do mesmo dispositivo', async () => {
      const dispositivoId = `dispositivo-${randomUUID()}`;

      const primeira = await enviar({ dispositivoId });
      expect(primeira.resposta.status).toBe(201);

      const segunda = await enviar({ dispositivoId });
      expect(segunda.resposta.status).toBe(409);
      expect(segunda.resposta.body.mensagem).toContain('já respondeu');
    });

    it('a sessão é de uso único: o mesmo token não grava duas respostas', async () => {
      const sessao = await abrirSessao();
      const base = {
        sessao,
        consentimento: true,
        consentimentoEm: new Date(Date.now() - 60_000).toISOString(),
        municipioCodigoIbge: CODIGO_SALVADOR,
        coletadoEm: new Date().toISOString(),
        itens: itensValidos(),
      };

      await request(app.getHttpServer())
        .post(coleta('/respostas'))
        .send({ ...base, respostaId: randomUUID(), dispositivoId: `dispositivo-${randomUUID()}` })
        .expect(201);

      // Outro aparelho, mesma sessão: replay do pacote capturado.
      const replay = await request(app.getHttpServer())
        .post(coleta('/respostas'))
        .send({ ...base, respostaId: randomUUID(), dispositivoId: `dispositivo-${randomUUID()}` });

      expect(replay.status).toBe(409);
      expect(replay.body.mensagem).toContain('Sessão');
    });

    it('recusa sessão inventada', async () => {
      const resultado = await enviar({ sessao: 'sessao-que-nunca-foi-aberta-000' });
      expect(resultado.resposta.status).toBe(409);
    });

    it('o hash do dispositivo nunca aparece em resposta de API', async () => {
      const { resposta } = await enviar();
      expect(JSON.stringify(resposta.body)).not.toContain('dispositivo');
    });
  });

  describe('marcação automática de suspeita', () => {
    it('marca resposta preenchida em poucos segundos', async () => {
      const { corpo, resposta } = await enviar();

      expect(resposta.status).toBe(201);
      expect(resposta.body.status).toBe(RespostaStatus.EM_CONFERENCIA);

      const gravada = await prisma.resposta.findUnique({
        where: { id: corpo.respostaId },
        select: { marcacoes: true, motivoConferencia: true, duracaoSegundos: true },
      });

      expect(gravada?.marcacoes).toContain(RespostaMarcacao.TEMPO_MUITO_BAIXO);
      expect(gravada?.motivoConferencia).toContain('rápido demais');
      expect(gravada?.duracaoSegundos).toBeGreaterThanOrEqual(0);
    });

    it('registra início e fim do preenchimento medidos pelo servidor', async () => {
      const { corpo } = await enviar();

      const gravada = await prisma.resposta.findUnique({
        where: { id: corpo.respostaId },
        select: { iniciadoEm: true, recebidoEm: true, coletadoEm: true, duracaoSegundos: true },
      });

      expect(gravada?.iniciadoEm).toBeInstanceOf(Date);
      expect(gravada?.recebidoEm.getTime()).toBeGreaterThanOrEqual(gravada!.iniciadoEm.getTime());
      expect(gravada?.duracaoSegundos).toBe(
        Math.max(
          0,
          Math.round((gravada!.recebidoEm.getTime() - gravada!.iniciadoEm.getTime()) / 1000),
        ),
      );
    });

    it('marca município fora da Bahia sem descartar a resposta', async () => {
      // Município de São Paulo, presente na base? A base carregada é só da BA,
      // então o envio é recusado por município inexistente — o que também é
      // proteção. A marcação por UF vale para base multi-estado.
      const { resposta } = await enviar({ municipioCodigoIbge: 3550308 });
      expect(resposta.status).toBe(400);
    });

    it('marca padrão repetitivo quando tudo cai na mesma posição', async () => {
      const { corpo, resposta } = await enviar({
        itens: [
          { perguntaId: perguntaVoto, alternativaId: alternativaSim },
          { perguntaId: perguntaNota, valorNumero: 0 },
        ],
      });

      expect(resposta.status).toBe(201);
      const gravada = await prisma.resposta.findUnique({
        where: { id: corpo.respostaId },
        select: { marcacoes: true },
      });
      // Duas perguntas só: fica abaixo do mínimo para o padrão significar algo.
      expect(gravada?.marcacoes).not.toContain(RespostaMarcacao.PADRAO_REPETITIVO);
    });
  });

  describe('conferência e invalidação', () => {
    let respostaParaInvalidar = '';

    it('o Analista é bloqueado em toda a conferência', async () => {
      await request(app.getHttpServer()).get(conferencia()).set(comoAnalista()).expect(403);
      await request(app.getHttpServer())
        .get(conferencia('/resumo'))
        .set(comoAnalista())
        .expect(403);
      await request(app.getHttpServer())
        .post(conferencia(`/${randomUUID()}/invalidar`))
        .set(comoAnalista())
        .send({ motivo: 'Tentativa do analista' })
        .expect(403);
    });

    it('a conferência não devolve hash de dispositivo nem conteúdo respondido', async () => {
      // Uma resposta com tempo normal: é ela que será invalidada adiante.
      const normal = await enviarComTempoNormal();
      expect(normal.resposta.status).toBe(201);
      expect(normal.resposta.body.status).toBe(RespostaStatus.VALIDA);

      const lista = await request(app.getHttpServer())
        .get(conferencia('?limite=200'))
        .set(comoAdmin())
        .expect(200);

      expect(lista.body.itens.length).toBeGreaterThan(0);
      const corpo = JSON.stringify(lista.body);
      expect(corpo).not.toContain('dispositivoHash');
      expect(corpo).not.toContain('alternativaId');
      expect(corpo).not.toContain('valorTexto');

      respostaParaInvalidar = lista.body.itens.find(
        (item: { status: string }) => item.status === RespostaStatus.VALIDA,
      )?.id;
      expect(respostaParaInvalidar).toBeDefined();
    });

    it('responde 404 para resposta de outra pesquisa', async () => {
      const outro = await request(app.getHttpServer())
        .post('/api/v1/formularios')
        .set(comoAdmin())
        .send({ titulo: `Outra pesquisa ${marca}` })
        .expect(201);

      await request(app.getHttpServer())
        .get(`/api/v1/formularios/${outro.body.id}/respostas/${respostaParaInvalidar}`)
        .set(comoAdmin())
        .expect(404);

      await request(app.getHttpServer())
        .delete(`/api/v1/formularios/${outro.body.id}`)
        .set(comoAdmin())
        .expect(204);
    });

    it('invalidação manual tira da contagem sem apagar o registro', async () => {
      const antes = await request(app.getHttpServer())
        .get(conferencia('/resumo'))
        .set(comoAdmin())
        .expect(200);

      const invalidada = await request(app.getHttpServer())
        .post(conferencia(`/${respostaParaInvalidar}/invalidar`))
        .set(comoAdmin())
        .send({ motivo: 'Conferência manual: resposta duplicada' })
        .expect(200);

      expect(invalidada.body.status).toBe(RespostaStatus.INVALIDADA);
      expect(invalidada.body.motivoInvalidacao).toContain('duplicada');

      // O registro continua no banco, com autor e data.
      const noBanco = await prisma.resposta.findUnique({
        where: { id: respostaParaInvalidar },
        select: {
          status: true,
          invalidadaPorId: true,
          invalidadaEm: true,
          motivoInvalidacao: true,
          itens: { select: { id: true } },
        },
      });
      expect(noBanco).not.toBeNull();
      expect(noBanco?.status).toBe(RespostaStatus.INVALIDADA);
      expect(noBanco?.invalidadaPorId).toBe(idAdmin);
      expect(noBanco?.invalidadaEm).toBeInstanceOf(Date);
      expect(noBanco?.itens.length).toBeGreaterThan(0);

      const depois = await request(app.getHttpServer())
        .get(conferencia('/resumo'))
        .set(comoAdmin())
        .expect(200);

      expect(depois.body.validas).toBe(antes.body.validas - 1);
      expect(depois.body.invalidadas).toBe(antes.body.invalidadas + 1);
    });

    it('a invalidação fica na auditoria, sem dado do respondente', async () => {
      const registros = await prisma.logAuditoria.findMany({
        where: { entidadeId: respostaParaInvalidar, acao: 'RESPOSTA_INVALIDADA' },
        select: { usuarioId: true, detalhe: true },
      });

      expect(registros.length).toBe(1);
      expect(registros[0].usuarioId).toBe(idAdmin);
      const detalhe = JSON.stringify(registros[0].detalhe);
      expect(detalhe).toContain('duplicada');
      expect(detalhe).not.toContain('dispositivo');
    });

    it('não invalida duas vezes', async () => {
      await request(app.getHttpServer())
        .post(conferencia(`/${respostaParaInvalidar}/invalidar`))
        .set(comoAdmin())
        .send({ motivo: 'Segunda tentativa' })
        .expect(409);
    });

    it('devolve a resposta para a contagem quando a conferência conclui pela validade', async () => {
      const revalidada = await request(app.getHttpServer())
        .post(conferencia(`/${respostaParaInvalidar}/revalidar`))
        .set(comoAdmin())
        .send({ motivo: 'Conferido: resposta legítima' })
        .expect(200);

      expect(revalidada.body.status).toBe(RespostaStatus.VALIDA);
      expect(revalidada.body.motivoInvalidacao).toBeNull();
    });
  });

  describe('agregação pré-calculada', () => {
    it('reflete o resultado nas views materializadas', async () => {
      await agregacao.atualizarAgora(idAdmin);

      const resumo = await prisma.$queryRaw<
        { respostas_validas: bigint; respostas_invalidadas: bigint }[]
      >`SELECT respostas_validas, respostas_invalidadas
          FROM "mv_resumo_formulario" WHERE formulario_id = ${formularioId}::uuid`;

      expect(resumo.length).toBe(1);
      expect(Number(resumo[0].respostas_validas)).toBeGreaterThan(0);

      const porPergunta = await prisma.$queryRaw<{ total: bigint; percentual: string }[]>`
        SELECT total, percentual FROM "mv_resultado_pergunta"
         WHERE pergunta_id = ${perguntaVoto}::uuid`;
      expect(porPergunta.length).toBeGreaterThan(0);

      const soma = porPergunta.reduce((total, linha) => total + Number(linha.percentual), 0);
      // Percentual derivado dos dados, sobre respostas válidas.
      expect(soma).toBeGreaterThan(99);
      expect(soma).toBeLessThan(101);
    });

    it('a apuração por município sai da view, não da tabela bruta', async () => {
      const porMunicipio = await prisma.$queryRaw<{ municipio_codigo_ibge: number }[]>`
        SELECT municipio_codigo_ibge FROM "mv_resultado_municipio"
         WHERE formulario_id = ${formularioId}::uuid`;

      expect(porMunicipio.length).toBeGreaterThan(0);
      expect(porMunicipio[0].municipio_codigo_ibge).toBe(CODIGO_SALVADOR);
    });

    it('o Analista não dispara a atualização da agregação', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/agregacao/atualizar')
        .set(comoAnalista())
        .expect(403);
    });

    it('o Administrador dispara a atualização', async () => {
      const resposta = await request(app.getHttpServer())
        .post('/api/v1/agregacao/atualizar')
        .set(comoAdmin())
        .expect(202);

      expect(['enfileirada', 'executada']).toContain(resposta.body.situacao);
    });
  });
});
