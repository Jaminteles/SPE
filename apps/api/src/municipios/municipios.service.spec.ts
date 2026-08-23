import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { MunicipiosRepository } from './municipios.repository';
import { MunicipiosService } from './municipios.service';

describe('MunicipiosService', () => {
  let servico: MunicipiosService;
  const repositorio = {
    listar: jest.fn(),
    buscarPorCodigoIbge: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    const modulo = await Test.createTestingModule({
      providers: [MunicipiosService, { provide: MunicipiosRepository, useValue: repositorio }],
    }).compile();
    servico = modulo.get(MunicipiosService);
  });

  it('aplica limite e deslocamento padrão quando não informados', async () => {
    repositorio.listar.mockResolvedValue({ itens: [], total: 0 });

    await servico.listar({});

    expect(repositorio.listar).toHaveBeenCalledWith({
      nome: undefined,
      limite: 50,
      deslocamento: 0,
    });
  });

  it('repassa o filtro por nome e a paginação informada', async () => {
    repositorio.listar.mockResolvedValue({ itens: [], total: 0 });

    await servico.listar({ nome: 'Salvador', limite: 10, deslocamento: 20 });

    expect(repositorio.listar).toHaveBeenCalledWith({
      nome: 'Salvador',
      limite: 10,
      deslocamento: 20,
    });
  });

  it('devolve o município encontrado pelo código IBGE', async () => {
    repositorio.buscarPorCodigoIbge.mockResolvedValue({
      codigoIbge: 2927408,
      nome: 'Salvador',
      uf: 'BA',
    });

    await expect(servico.buscarPorCodigoIbge(2927408)).resolves.toEqual({
      codigoIbge: 2927408,
      nome: 'Salvador',
      uf: 'BA',
    });
  });

  it('recusa código IBGE inexistente sem vazar detalhe interno', async () => {
    repositorio.buscarPorCodigoIbge.mockResolvedValue(null);

    await expect(servico.buscarPorCodigoIbge(9999999)).rejects.toBeInstanceOf(NotFoundException);
  });
});
