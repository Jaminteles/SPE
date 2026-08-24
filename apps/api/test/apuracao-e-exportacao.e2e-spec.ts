import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  AuditoriaAcao,
  PerfilCodigo,
  PerguntaTipo,
  PrismaClient,
  RespostaStatus,
} from '@prisma/client';
import { createHmac, randomUUID } from 'node:crypto';
import request from 'supertest';

import { AgregacaoService } from '../src/agregacao/agregacao.service';
import { AppModule } from '../src/app.module';
import { SenhaService } from '../src/auth/senha.service';
import { TodasExcecoesFilter } from '../src/common/filters/todas-excecoes.filter';

/**
 * E2E do critério de aceite da Sprint 7: os totais do painel batem com os do
 * arquivo exportado, e a exportação aparece no log de auditoria com usuário e
 * data/hora.
 *
 * O PDF fica de fora daqui de propósito: ele renderiza o painel em um navegador
 * de verdade, o que exige o painel servido — é verificação de ambiente, não de
 * suite.
 */
describe('Apuração por município e exportação (e2e)', () => {
  let app: INestApplication;
  let agregacao: AgregacaoService;
  const prisma = new PrismaClient();
  const senhas = new SenhaService();

  const marca = Date.now();
  const emailAdmin = `admin.exportacao.${marca}@exemplo.br`;
  const emailAnalista = `analista.exportacao.${marca}@exemplo.br`;
  const SENHA = 'Senha-De-Teste-2026';

  const SALVADOR = 2927408;
  const FEIRA = 2910800;
  const TOTAL_DE_RESPOSTAS = 200;
  const INVALIDADAS = TOTAL_DE_RESPOSTAS / 40;
  const VALIDAS = TOTAL_DE_RESPOSTAS - INVALIDADAS;
  const MUNICIPIOS_DA_BAHIA = 417;

  let idAdmin = '';
  let idAnalista = '';
  let tokenAdmin = '';
  let tokenAnalista = '';
  let formularioId = '';
  let perguntaVoto = '';
  let perguntaIdade = '';
  const alternativasDeVoto: string[] = [];
  const alternativasDeIdade: string[] = [];

  const comoAdmin = () => ({ Authorization: `Bearer ${tokenAdmin}` });
  const comoAnalista = () => ({ Authorization: `Bearer ${tokenAnalista}` });
  const rota = (sufixo = '') => `/api/v1/resultados/${formularioId}${sufixo}`;
  const exportar = (formato: string) => `/api/v1/exportacao/${formularioId}/${formato}`;

  /** Popula direto no banco: aqui interessa volume agregado, não o fluxo de coleta. */
  async function popular() {
    const pepper = process.env.DEVICE_HASH_PEPPER as string;
    const respostas = [];
    const itens: { respostaId: string; perguntaId: string; alternativaId: string }[] = [];

    for (let indice = 0; indice < TOTAL_DE_RESPOSTAS; indice += 1) {
      const id = randomUUID();
      const momento = new Date(Date.now() - (indice % 3) * 24 * 60 * 60 * 1000);
      const invalidada = indice % 40 === 0;

      respostas.push({
        id,
        formularioId,
        municipioCodigoIbge: indice % 4 === 0 ? FEIRA : SALVADOR,
        status: invalidada ? RespostaStatus.INVALIDADA : RespostaStatus.VALIDA,
        origem: 'APLICATIVO' as const,
        dispositivoHash: createHmac('sha256', pepper).update(id).digest('hex'),
        consentimentoEm: momento,
        iniciadoEm: momento,
        coletadoEm: momento,
        recebidoEm: momento,
        duracaoSegundos: 90,
        invalidadaEm: invalidada ? momento : null,
        motivoInvalidacao: invalidada ? 'Conferência de teste' : null,
      });

      itens.push(
        {
          respostaId: id,
          perguntaId: perguntaVoto,
          alternativaId: alternativasDeVoto[indice % 10 < 6 ? 0 : 1],
        },
        {
          respostaId: id,
          perguntaId: perguntaIdade,
          alternativaId: alternativasDeIdade[indice % 2],
        },
      );
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

    idAdmin = await criarUsuario('Admin Exportação', emailAdmin, PerfilCodigo.ADMINISTRADOR);
    idAnalista = await criarUsuario('Analista Exportação', emailAnalista, PerfilCodigo.ANALISTA);

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
      .send({ titulo: `Pesquisa de exportação ${marca}` })
      .expect(201);
    formularioId = criado.body.id;

    const criarPergunta = async (enunciado: string, textos: string[], destino: string[]) => {
      const pergunta = await request(app.getHttpServer())
        .post(`/api/v1/formularios/${formularioId}/perguntas`)
        .set(comoAdmin())
        .send({ enunciado, tipo: PerguntaTipo.UNICA_ESCOLHA })
        .expect(201);

      for (const texto of textos) {
        const alternativa = await request(app.getHttpServer())
          .post(`/api/v1/formularios/${formularioId}/perguntas/${pergunta.body.id}/alternativas`)
          .set(comoAdmin())
          .send({ texto })
          .expect(201);
        destino.push(alternativa.body.id);
      }

      return pergunta.body.id as string;
    };

    perguntaVoto = await criarPergunta(
      'Em quem você votaria?',
      ['Candidato A', 'Candidato B'],
      alternativasDeVoto,
    );
    perguntaIdade = await criarPergunta(
      'Qual sua faixa etária?',
      ['16 a 24', '25 ou mais'],
      alternativasDeIdade,
    );

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

  describe('ranking por município', () => {
    it('soma o mesmo total que o indicador do painel, com percentual derivado', async () => {
      const [indicadores, ranking] = await Promise.all([
        request(app.getHttpServer()).get(rota('/indicadores')).set(comoAnalista()).expect(200),
        request(app.getHttpServer())
          .get(rota('/ranking-municipios'))
          .set(comoAnalista())
          .expect(200),
      ]);

      const soma = ranking.body.municipios.reduce(
        (total: number, municipio: { respostasValidas: number }) =>
          total + municipio.respostasValidas,
        0,
      );

      expect(indicadores.body.respostasValidas).toBe(VALIDAS);
      expect(ranking.body.total).toBe(indicadores.body.respostasValidas);
      expect(soma).toBe(ranking.body.total);
      expect(ranking.body.municipios.map((m: { posicao: number }) => m.posicao)).toEqual([1, 2]);

      const percentuais = ranking.body.municipios.reduce(
        (total: number, municipio: { percentual: number }) => total + municipio.percentual,
        0,
      );
      expect(percentuais).toBeCloseTo(100, 1);
    });

    it('o filtro de município restringe o ranking', async () => {
      const resposta = await request(app.getHttpServer())
        .get(rota(`/ranking-municipios?municipioCodigoIbge=${FEIRA}`))
        .set(comoAnalista())
        .expect(200);

      expect(resposta.body.municipios).toHaveLength(1);
      expect(resposta.body.municipios[0].codigoIbge).toBe(FEIRA);
      expect(resposta.body.municipios[0].percentual).toBe(100);
    });
  });

  describe('cobertura', () => {
    it('lista os 417 municípios da Bahia, com zero para quem não foi alcançado', async () => {
      const resposta = await request(app.getHttpServer())
        .get(rota('/cobertura'))
        .set(comoAnalista())
        .expect(200);

      expect(resposta.body.municipiosDaBahia).toBe(MUNICIPIOS_DA_BAHIA);
      expect(resposta.body.municipios).toHaveLength(MUNICIPIOS_DA_BAHIA);
      expect(resposta.body.alcancados).toBe(2);

      const naoAlcancados = resposta.body.municipios.filter(
        (municipio: { respostasValidas: number }) => municipio.respostasValidas === 0,
      );
      expect(naoAlcancados).toHaveLength(MUNICIPIOS_DA_BAHIA - 2);
    });
  });

  describe('cruzamento entre perguntas', () => {
    it('cruza intenção de voto por faixa etária, com percentual por linha', async () => {
      const resposta = await request(app.getHttpServer())
        .get(rota(`/cruzamento?perguntaAId=${perguntaVoto}&perguntaBId=${perguntaIdade}`))
        .set(comoAnalista())
        .expect(200);

      expect(resposta.body.total).toBe(VALIDAS);
      expect(resposta.body.linhas).toHaveLength(2);
      expect(resposta.body.colunas).toHaveLength(2);

      for (const linha of resposta.body.linhas) {
        const soma = linha.celulas.reduce(
          (total: number, celula: { total: number }) => total + celula.total,
          0,
        );
        expect(soma).toBe(linha.total);

        const percentuais = linha.celulas.reduce(
          (total: number, celula: { percentual: number }) => total + celula.percentual,
          0,
        );
        expect(percentuais).toBeCloseTo(100, 1);
      }
    });

    it('devolve o mesmo conteúdo com os eixos invertidos', async () => {
      const [direto, invertido] = await Promise.all([
        request(app.getHttpServer())
          .get(rota(`/cruzamento?perguntaAId=${perguntaVoto}&perguntaBId=${perguntaIdade}`))
          .set(comoAnalista())
          .expect(200),
        request(app.getHttpServer())
          .get(rota(`/cruzamento?perguntaAId=${perguntaIdade}&perguntaBId=${perguntaVoto}`))
          .set(comoAnalista())
          .expect(200),
      ]);

      expect(invertido.body.total).toBe(direto.body.total);
      expect(invertido.body.perguntaLinhas.perguntaId).toBe(perguntaIdade);
    });

    it('recusa cruzar uma pergunta com ela mesma e pergunta de fora da pesquisa', async () => {
      await request(app.getHttpServer())
        .get(rota(`/cruzamento?perguntaAId=${perguntaVoto}&perguntaBId=${perguntaVoto}`))
        .set(comoAnalista())
        .expect(400);

      await request(app.getHttpServer())
        .get(rota(`/cruzamento?perguntaAId=${perguntaVoto}&perguntaBId=${randomUUID()}`))
        .set(comoAnalista())
        .expect(404);
    });
  });

  describe('exportação', () => {
    it('o CSV fecha com o total que o painel mostra', async () => {
      const [indicadores, arquivo] = await Promise.all([
        request(app.getHttpServer()).get(rota('/indicadores')).set(comoAnalista()).expect(200),
        request(app.getHttpServer()).get(exportar('csv')).set(comoAnalista()).expect(200),
      ]);

      expect(arquivo.headers['content-type']).toContain('text/csv');
      expect(arquivo.headers['content-disposition']).toContain('attachment; filename="pesquisa-');

      const texto = arquivo.text ?? arquivo.body.toString('utf8');
      const totalDosMunicipios = texto
        .split('\r\n')
        .filter((linha: string) => linha.startsWith('"municipio"'))
        .reduce(
          (total: number, linha: string) => total + Number(linha.split(';')[6].replace(/"/g, '')),
          0,
        );

      expect(totalDosMunicipios).toBe(indicadores.body.respostasValidas);
    });

    it('o XLSX sai como planilha de verdade', async () => {
      const arquivo = await request(app.getHttpServer())
        .get(exportar('xlsx'))
        .set(comoAnalista())
        .buffer()
        .parse((res, callback) => {
          const pedacos: Buffer[] = [];
          res.on('data', (pedaco: Buffer) => pedacos.push(pedaco));
          res.on('end', () => callback(null, Buffer.concat(pedacos)));
        })
        .expect(200);

      expect(arquivo.headers['content-type']).toContain('spreadsheetml');
      // Assinatura de arquivo ZIP, que é o container do XLSX.
      expect((arquivo.body as Buffer).subarray(0, 2).toString('utf8')).toBe('PK');
    });

    it('registra a exportação em auditoria, com usuário e data/hora', async () => {
      await request(app.getHttpServer())
        .get(`${exportar('csv')}?municipioCodigoIbge=${SALVADOR}`)
        .set(comoAnalista())
        .expect(200);

      const registro = await prisma.logAuditoria.findFirst({
        where: {
          acao: AuditoriaAcao.EXPORTACAO_GERADA,
          usuarioId: idAnalista,
          entidadeId: formularioId,
        },
        orderBy: { criadoEm: 'desc' },
      });

      expect(registro).not.toBeNull();
      expect(registro?.criadoEm).toBeInstanceOf(Date);

      const detalhe = JSON.stringify(registro?.detalhe);
      expect(detalhe).toContain('csv');
      // Nada que permita reidentificar respondente entra na trilha.
      expect(detalhe).not.toContain('dispositivo');
      expect(detalhe).not.toContain('latitude');
      expect(detalhe).not.toContain(tokenAnalista);
    });

    it('não devolve resposta individual em nenhum formato', async () => {
      const arquivo = await request(app.getHttpServer())
        .get(exportar('csv'))
        .set(comoAnalista())
        .expect(200);

      const texto = arquivo.text ?? arquivo.body.toString('utf8');
      expect(texto).not.toContain('dispositivo');
      expect(texto).not.toContain('latitude');
      expect(texto).not.toContain('resposta_id');
    });

    it('recusa formato desconhecido e pesquisa inexistente', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/exportacao/${formularioId}/docx`)
        .set(comoAnalista())
        .expect(404);

      await request(app.getHttpServer())
        .get(`/api/v1/exportacao/${randomUUID()}/csv`)
        .set(comoAnalista())
        .expect(404);
    });
  });

  describe('controle de acesso', () => {
    it('exportação sem token responde 401', async () => {
      await request(app.getHttpServer()).get(exportar('csv')).expect(401);
      await request(app.getHttpServer()).get(rota('/ranking-municipios')).expect(401);
      await request(app.getHttpServer()).get(rota('/cobertura')).expect(401);
    });

    it('o Analista exporta, mas continua barrado na administração ao trocar o id', async () => {
      await request(app.getHttpServer()).get(exportar('csv')).set(comoAnalista()).expect(200);

      await request(app.getHttpServer())
        .get(`/api/v1/formularios/${formularioId}`)
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

      await request(app.getHttpServer())
        .get(`/api/v1/auditoria?usuarioId=${idAdmin}`)
        .set(comoAnalista())
        .expect(403);
    });

    it('rascunho não é exportável', async () => {
      const rascunho = await request(app.getHttpServer())
        .post('/api/v1/formularios')
        .set(comoAdmin())
        .send({ titulo: `Rascunho de exportação ${marca}` })
        .expect(201);

      await request(app.getHttpServer())
        .get(`/api/v1/exportacao/${rascunho.body.id}/csv`)
        .set(comoAnalista())
        .expect(404);

      await request(app.getHttpServer())
        .delete(`/api/v1/formularios/${rascunho.body.id}`)
        .set(comoAdmin())
        .expect(204);
    });
  });
});
