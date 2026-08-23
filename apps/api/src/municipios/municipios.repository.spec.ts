import { Test } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';
import { MunicipiosRepository } from './municipios.repository';

describe('MunicipiosRepository', () => {
  let repositorio: MunicipiosRepository;
  const prisma = {
    municipio: { findMany: jest.fn(), count: jest.fn(), findUnique: jest.fn() },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    prisma.$transaction.mockResolvedValue([[], 0]);
    const modulo = await Test.createTestingModule({
      providers: [MunicipiosRepository, { provide: PrismaService, useValue: prisma }],
    }).compile();
    repositorio = modulo.get(MunicipiosRepository);
  });

  it('restringe a consulta à Bahia mesmo sem filtro de nome', async () => {
    await repositorio.listar({ limite: 50, deslocamento: 0 });

    expect(prisma.municipio.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { uf: 'BA' } }),
    );
  });

  it('nunca projeta o id interno do município', async () => {
    await repositorio.listar({ limite: 50, deslocamento: 0 });

    const argumento = prisma.municipio.findMany.mock.calls[0][0];
    expect(argumento.select).toEqual({ codigoIbge: true, nome: true, uf: true });
    expect(argumento.select).not.toHaveProperty('id');
  });

  it('busca por código IBGE, nunca por id sequencial', async () => {
    prisma.municipio.findUnique.mockResolvedValue(null);

    await repositorio.buscarPorCodigoIbge(2927408);

    expect(prisma.municipio.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { codigoIbge: 2927408 } }),
    );
  });
});
