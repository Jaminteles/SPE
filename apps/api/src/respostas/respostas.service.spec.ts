import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AuditoriaAcao, RespostaOrigem, RespostaStatus } from '@prisma/client';

import { AuditoriaService } from '../auditoria/auditoria.service';
import { RespostasRepository } from './respostas.repository';
import { RespostasService } from './respostas.service';

describe('RespostasService', () => {
  let servico: RespostasService;

  const repositorio = {
    listar: jest.fn(),
    buscar: jest.fn(),
    invalidar: jest.fn(),
    revalidar: jest.fn(),
    resumo: jest.fn(),
  };
  const auditoria = { registrar: jest.fn() };

  const resposta = (status: RespostaStatus = RespostaStatus.VALIDA) => ({
    id: 'resposta-1',
    status,
    origem: RespostaOrigem.APLICATIVO,
    municipioCodigoIbge: 2927408,
    municipioNome: 'Salvador',
    iniciadoEm: new Date(),
    coletadoEm: new Date(),
    recebidoEm: new Date(),
    duracaoSegundos: 120,
    marcacoes: [],
    motivoConferencia: null,
    motivoInvalidacao: null,
    invalidadaEm: null,
    temGeolocalizacao: false,
    latitude: null,
    longitude: null,
  });

  beforeEach(async () => {
    jest.resetAllMocks();
    const modulo = await Test.createTestingModule({
      providers: [
        RespostasService,
        { provide: RespostasRepository, useValue: repositorio },
        { provide: AuditoriaService, useValue: auditoria },
      ],
    }).compile();
    servico = modulo.get(RespostasService);
  });

  it('responde 404 para resposta de outra pesquisa', async () => {
    repositorio.buscar.mockResolvedValue(null);

    await expect(servico.buscar('form-1', 'resposta-de-outra')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  describe('invalidação', () => {
    it('muda o status e audita, sem apagar o registro', async () => {
      repositorio.buscar
        .mockResolvedValueOnce(resposta())
        .mockResolvedValueOnce(resposta(RespostaStatus.INVALIDADA));
      repositorio.invalidar.mockResolvedValue(1);

      const resultado = await servico.invalidar('form-1', 'resposta-1', 'Duplicidade', 'admin-1');

      expect(repositorio.invalidar).toHaveBeenCalledWith('resposta-1', 'admin-1', 'Duplicidade');
      expect(resultado.status).toBe(RespostaStatus.INVALIDADA);
      expect(auditoria.registrar).toHaveBeenCalledWith(
        expect.objectContaining({
          acao: AuditoriaAcao.RESPOSTA_INVALIDADA,
          entidade: 'resposta',
          entidadeId: 'resposta-1',
          usuarioId: 'admin-1',
        }),
      );
    });

    it('não registra hash de dispositivo nem conteúdo na auditoria', async () => {
      repositorio.buscar
        .mockResolvedValueOnce(resposta())
        .mockResolvedValueOnce(resposta(RespostaStatus.INVALIDADA));
      repositorio.invalidar.mockResolvedValue(1);

      await servico.invalidar('form-1', 'resposta-1', 'Padrão repetitivo', 'admin-1');

      const registro = JSON.stringify(auditoria.registrar.mock.calls);
      expect(registro).not.toContain('dispositivo');
      expect(registro).not.toContain('alternativa');
    });

    it('recusa invalidar o que já está invalidado', async () => {
      repositorio.buscar.mockResolvedValue(resposta(RespostaStatus.INVALIDADA));

      await expect(
        servico.invalidar('form-1', 'resposta-1', 'Duplicidade', 'admin-1'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(repositorio.invalidar).not.toHaveBeenCalled();
    });

    it('detecta corrida entre a leitura e a gravação', async () => {
      repositorio.buscar.mockResolvedValue(resposta());
      repositorio.invalidar.mockResolvedValue(0);

      await expect(
        servico.invalidar('form-1', 'resposta-1', 'Duplicidade', 'admin-1'),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('revalidação', () => {
    it('devolve a resposta para a contagem e audita', async () => {
      repositorio.buscar
        .mockResolvedValueOnce(resposta(RespostaStatus.INVALIDADA))
        .mockResolvedValueOnce(resposta());
      repositorio.revalidar.mockResolvedValue(1);

      const resultado = await servico.revalidar(
        'form-1',
        'resposta-1',
        'Conferido: resposta legítima',
        'admin-1',
      );

      expect(resultado.status).toBe(RespostaStatus.VALIDA);
      expect(auditoria.registrar).toHaveBeenCalledWith(
        expect.objectContaining({ acao: AuditoriaAcao.RESPOSTA_REVALIDADA }),
      );
    });

    it('só revalida o que está invalidado', async () => {
      repositorio.buscar.mockResolvedValue(resposta());

      await expect(
        servico.revalidar('form-1', 'resposta-1', 'Motivo qualquer', 'admin-1'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(repositorio.revalidar).not.toHaveBeenCalled();
    });
  });
});
