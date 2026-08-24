import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { AuditoriaAcao } from '@prisma/client';

import { AuditoriaService } from '../auditoria/auditoria.service';
import { ExpurgoRepository } from './expurgo.repository';
import { ExpurgoService } from './expurgo.service';

describe('ExpurgoService', () => {
  let servico: ExpurgoService;

  const repositorio = {
    pesquisasComExpurgoTecnicoPendente: jest.fn(),
    pesquisaComExpurgoTecnicoPendente: jest.fn(),
    expurgarDadosTecnicos: jest.fn(),
    apagarRespostasVencidas: jest.fn(),
    situacao: jest.fn(),
  };
  const auditoria = { registrar: jest.fn() };

  const valores: Record<string, unknown> = {
    EXPURGO_ANOS: 4,
    EXPURGO_LOTE: 2,
    EXPURGO_LOTES_POR_CICLO: 5,
    NODE_ENV: 'test',
  };
  const config = {
    get: jest.fn((chave: string, padrao?: unknown) => valores[chave] ?? padrao),
  };

  const ENCERRADA_EM = new Date('2026-08-20T12:00:00.000Z');

  beforeEach(async () => {
    jest.resetAllMocks();
    config.get.mockImplementation((chave: string, padrao?: unknown) => valores[chave] ?? padrao);
    repositorio.pesquisasComExpurgoTecnicoPendente.mockResolvedValue([]);
    repositorio.pesquisaComExpurgoTecnicoPendente.mockResolvedValue(null);
    repositorio.apagarRespostasVencidas.mockResolvedValue({ apagadas: 0, pesquisas: [] });

    const modulo = await Test.createTestingModule({
      providers: [
        ExpurgoService,
        { provide: ExpurgoRepository, useValue: repositorio },
        { provide: AuditoriaService, useValue: auditoria },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();

    servico = modulo.get(ExpurgoService);
  });

  describe('prazo de retenção', () => {
    it('conta 4 anos a partir do encerramento da coleta', () => {
      const prazo = ExpurgoRepository.prazoDeRetencao(ENCERRADA_EM, 4);

      expect(prazo.toISOString()).toBe('2030-08-20T12:00:00.000Z');
    });
  });

  describe('expurgo técnico no encerramento', () => {
    it('anonimiza o dispositivo, apaga sessões e carimba o prazo das respostas', async () => {
      repositorio.pesquisaComExpurgoTecnicoPendente.mockResolvedValue({
        id: 'form-1',
        titulo: 'Pesquisa',
        encerradoEm: ENCERRADA_EM,
      });
      repositorio.expurgarDadosTecnicos.mockResolvedValue({ respostas: 120, sessoes: 30 });

      const resumo = await servico.executarAgora('form-1');

      const [formularioId, prazo] = repositorio.expurgarDadosTecnicos.mock.calls[0];
      expect(formularioId).toBe('form-1');
      expect((prazo as Date).toISOString()).toBe('2030-08-20T12:00:00.000Z');

      expect(resumo.pesquisasAnonimizadas).toBe(1);
      expect(resumo.dispositivosApagados).toBe(120);
      expect(resumo.sessoesApagadas).toBe(30);
    });

    it('registra a auditoria sem qualquer hash de dispositivo', async () => {
      repositorio.pesquisaComExpurgoTecnicoPendente.mockResolvedValue({
        id: 'form-1',
        titulo: 'Pesquisa',
        encerradoEm: ENCERRADA_EM,
      });
      repositorio.expurgarDadosTecnicos.mockResolvedValue({ respostas: 5, sessoes: 2 });

      await servico.executarAgora('form-1');

      const registro = auditoria.registrar.mock.calls[0][0];
      expect(registro.acao).toBe(AuditoriaAcao.EXPURGO_TECNICO);
      expect(registro.entidadeId).toBe('form-1');
      expect(registro.detalhe.respostasAnonimizadas).toBe(5);

      const serializado = JSON.stringify(registro).toLowerCase();
      expect(serializado).not.toContain('dispositivohash');
      expect(serializado).not.toContain('token');
    });

    it('é idempotente: pesquisa já expurgada não gera nova escrita nem auditoria', async () => {
      repositorio.pesquisaComExpurgoTecnicoPendente.mockResolvedValue(null);

      const resumo = await servico.executarAgora('form-1');

      expect(repositorio.expurgarDadosTecnicos).not.toHaveBeenCalled();
      expect(auditoria.registrar).not.toHaveBeenCalled();
      expect(resumo.pesquisasAnonimizadas).toBe(0);
    });

    it('varre as pendentes quando roda sem pesquisa específica', async () => {
      repositorio.pesquisasComExpurgoTecnicoPendente.mockResolvedValue([
        { id: 'form-1', titulo: 'A', encerradoEm: ENCERRADA_EM },
        { id: 'form-2', titulo: 'B', encerradoEm: ENCERRADA_EM },
      ]);
      repositorio.pesquisaComExpurgoTecnicoPendente.mockImplementation(async (id: string) => ({
        id,
        titulo: id,
        encerradoEm: ENCERRADA_EM,
      }));
      repositorio.expurgarDadosTecnicos.mockResolvedValue({ respostas: 10, sessoes: 1 });

      const resumo = await servico.executarAgora();

      expect(resumo.pesquisasAnonimizadas).toBe(2);
      expect(resumo.dispositivosApagados).toBe(20);
    });
  });

  describe('expurgo das respostas por prazo', () => {
    it('apaga em lotes até esvaziar e audita o total', async () => {
      repositorio.apagarRespostasVencidas
        .mockResolvedValueOnce({ apagadas: 2, pesquisas: ['form-1'] })
        .mockResolvedValueOnce({ apagadas: 2, pesquisas: ['form-1', 'form-2'] })
        .mockResolvedValue({ apagadas: 0, pesquisas: [] });

      const resumo = await servico.executarAgora();

      expect(resumo.respostasApagadas).toBe(4);
      expect(repositorio.apagarRespostasVencidas).toHaveBeenCalledTimes(3);

      const registro = auditoria.registrar.mock.calls[0][0];
      expect(registro.acao).toBe(AuditoriaAcao.EXPURGO_RESPOSTAS);
      expect(registro.detalhe.respostasApagadas).toBe(4);
      expect(registro.detalhe.pesquisasAtingidas).toBe(2);
    });

    it('respeita o teto de lotes por ciclo, para o job não virar maratona', async () => {
      repositorio.apagarRespostasVencidas.mockResolvedValue({ apagadas: 2, pesquisas: ['form-1'] });

      const resumo = await servico.executarAgora();

      expect(repositorio.apagarRespostasVencidas).toHaveBeenCalledTimes(5);
      expect(resumo.respostasApagadas).toBe(10);
    });

    it('não audita nada quando não havia o que apagar', async () => {
      const resumo = await servico.executarAgora();

      expect(resumo.respostasApagadas).toBe(0);
      expect(auditoria.registrar).not.toHaveBeenCalled();
    });
  });

  describe('encerramento da coleta', () => {
    it('sem fila, executa o expurgo técnico na hora', async () => {
      repositorio.pesquisaComExpurgoTecnicoPendente.mockResolvedValue({
        id: 'form-1',
        titulo: 'Pesquisa',
        encerradoEm: ENCERRADA_EM,
      });
      repositorio.expurgarDadosTecnicos.mockResolvedValue({ respostas: 3, sessoes: 1 });

      await servico.aoEncerrarColeta('form-1');

      expect(repositorio.expurgarDadosTecnicos).toHaveBeenCalledWith('form-1', expect.any(Date));
    });

    it('falha no expurgo não derruba o encerramento', async () => {
      repositorio.pesquisaComExpurgoTecnicoPendente.mockRejectedValue(new Error('banco fora'));

      await expect(servico.aoEncerrarColeta('form-1')).resolves.toBeUndefined();
    });
  });
});
