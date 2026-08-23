import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { TodasExcecoesFilter } from '../src/common/filters/todas-excecoes.filter';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * E2E do fluxo público de consulta de municípios.
 * O PrismaService é substituído: o teste valida contrato, validação de entrada
 * e formato da resposta, sem depender de banco.
 */
describe('Municípios (e2e)', () => {
  let app: INestApplication;

  const salvador = { codigoIbge: 2927408, nome: 'Salvador', uf: 'BA' };

  const prismaFake = {
    $connect: jest.fn().mockResolvedValue(undefined),
    $disconnect: jest.fn().mockResolvedValue(undefined),
    verificarConexao: jest.fn().mockResolvedValue(true),
    $transaction: jest.fn().mockResolvedValue([[salvador], 1]),
    municipio: {
      findMany: jest.fn().mockResolvedValue([salvador]),
      count: jest.fn().mockResolvedValue(1),
      findUnique: jest.fn().mockResolvedValue(salvador),
    },
  };

  beforeAll(async () => {
    process.env.DATABASE_URL = 'postgresql://spe:spe@localhost:5432/spe_test?schema=public';
    process.env.NODE_ENV = 'test';
    process.env.THROTTLE_LIMIT = '1000';
    process.env.JWT_SECRET = 'segredo-de-teste-com-32-caracteres-ou-mais';

    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prismaFake)
      .compile();

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
    await app.close();
  });

  it('GET /api/v1/health responde ok', async () => {
    const resposta = await request(app.getHttpServer()).get('/api/v1/health').expect(200);
    expect(resposta.body).toEqual({ status: 'ok', banco: 'ok' });
  });

  it('GET /api/v1/municipios devolve itens e total, sem id interno', async () => {
    const resposta = await request(app.getHttpServer()).get('/api/v1/municipios').expect(200);

    expect(resposta.body.total).toBe(1);
    expect(resposta.body.itens[0]).toEqual(salvador);
    expect(resposta.body.itens[0]).not.toHaveProperty('id');
  });

  it('recusa parâmetro de consulta não declarado', async () => {
    await request(app.getHttpServer()).get('/api/v1/municipios?uf=SP').expect(400);
  });

  it('recusa limite acima do teto', async () => {
    await request(app.getHttpServer()).get('/api/v1/municipios?limite=100000').expect(400);
  });

  it('recusa nome com caractere de injeção', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/municipios?nome=${encodeURIComponent("'; DROP TABLE municipio; --")}`)
      .expect(400);
  });

  it('recusa código IBGE não numérico', async () => {
    await request(app.getHttpServer()).get('/api/v1/municipios/abc').expect(400);
  });

  it('não vaza detalhe interno quando o banco falha', async () => {
    prismaFake.$transaction.mockRejectedValueOnce(new Error('connection to server at "db" failed'));

    const resposta = await request(app.getHttpServer()).get('/api/v1/municipios').expect(500);

    expect(JSON.stringify(resposta.body)).not.toContain('connection to server');
    expect(resposta.body.mensagem).toBe('Erro interno.');
  });
});
