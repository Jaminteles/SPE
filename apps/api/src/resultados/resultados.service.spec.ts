import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PerguntaTipo } from '@prisma/client';

import { ResultadosRepository } from './resultados.repository';
import { ResultadosService } from './resultados.service';

describe('ResultadosService', () => {
  let servico: ResultadosService;

  const repositorio = {
    formulariosComResultado: jest.fn(),
    resumo: jest.fn(),
    respostasValidasNoRecorte: jest.fn(),
    totalDeMunicipiosDaBahia: jest.fn(),
    totaisPorAlternativa: jest.fn(),
    estrutura: jest.fn(),
    evolucao: jest.fn(),
    alcancePorMunicipio: jest.fn(),
    formularioExiste: jest.fn(),
  };

  const estrutura = [
    {
      id: 'p1',
      enunciado: 'Em quem você votaria?',
      tipo: PerguntaTipo.UNICA_ESCOLHA,
      ordem: 1,
      alternativas: [
        { id: 'a1', texto: 'Candidato A', ordem: 1 },
        { id: 'a2', texto: 'Candidato B', ordem: 2 },
        { id: 'a3', texto: 'Ninguém', ordem: 3 },
      ],
    },
    {
      id: 'p2',
      enunciado: 'Comentário',
      tipo: PerguntaTipo.TEXTO_LIVRE,
      ordem: 2,
      alternativas: [],
    },
  ];

  beforeEach(async () => {
    jest.resetAllMocks();
    repositorio.formularioExiste.mockResolvedValue(true);
    repositorio.estrutura.mockResolvedValue(estrutura);
    repositorio.totalDeMunicipiosDaBahia.mockResolvedValue(417);

    const modulo = await Test.createTestingModule({
      providers: [ResultadosService, { provide: ResultadosRepository, useValue: repositorio }],
    }).compile();
    servico = modulo.get(ResultadosService);
  });

  it('recusa pesquisa inexistente ou em rascunho', async () => {
    repositorio.formularioExiste.mockResolvedValue(false);

    await expect(servico.indicadores('form-1', {})).rejects.toBeInstanceOf(NotFoundException);
    await expect(servico.porPergunta('form-1', {})).rejects.toBeInstanceOf(NotFoundException);
    await expect(servico.evolucao('form-1', {})).rejects.toBeInstanceOf(NotFoundException);
  });

  describe('resultado por pergunta', () => {
    it('calcula o percentual sobre o total do recorte, sem valor fixo', async () => {
      repositorio.totaisPorAlternativa.mockResolvedValue([
        { perguntaId: 'p1', alternativaId: 'a1', total: 60 },
        { perguntaId: 'p1', alternativaId: 'a2', total: 30 },
        { perguntaId: 'p1', alternativaId: 'a3', total: 10 },
      ]);

      const resultado = await servico.porPergunta('form-1', {});
      const pergunta = resultado.perguntas[0];

      expect(pergunta.totalDeRespostas).toBe(100);
      expect(pergunta.alternativas.map((a) => a.percentual)).toEqual([60, 30, 10]);
      expect(pergunta.alternativas.reduce((soma, a) => soma + a.percentual, 0)).toBeCloseTo(100, 1);
    });

    it('mostra alternativa sem resposta com zero, em vez de omitir', async () => {
      repositorio.totaisPorAlternativa.mockResolvedValue([
        { perguntaId: 'p1', alternativaId: 'a1', total: 5 },
      ]);

      const resultado = await servico.porPergunta('form-1', {});

      expect(resultado.perguntas[0].alternativas).toHaveLength(3);
      expect(resultado.perguntas[0].alternativas[2]).toMatchObject({ total: 0, percentual: 0 });
    });

    it('não divide por zero quando o recorte não tem resposta', async () => {
      repositorio.totaisPorAlternativa.mockResolvedValue([]);

      const resultado = await servico.porPergunta('form-1', {});

      expect(resultado.perguntas[0].totalDeRespostas).toBe(0);
      expect(resultado.perguntas[0].alternativas.every((a) => a.percentual === 0)).toBe(true);
    });

    it('deixa de fora pergunta sem alternativa', async () => {
      repositorio.totaisPorAlternativa.mockResolvedValue([]);

      const resultado = await servico.porPergunta('form-1', {});

      expect(resultado.perguntas.map((p) => p.perguntaId)).toEqual(['p1']);
    });

    it('restringe a uma pergunta quando o filtro pede', async () => {
      repositorio.totaisPorAlternativa.mockResolvedValue([]);

      const resultado = await servico.porPergunta('form-1', { perguntaId: 'p2' });

      expect(resultado.perguntas).toHaveLength(0);
      expect(repositorio.totaisPorAlternativa).toHaveBeenCalledWith(
        expect.objectContaining({ perguntaId: 'p2' }),
      );
    });

    it('repassa município e período para o recorte', async () => {
      repositorio.totaisPorAlternativa.mockResolvedValue([]);
      const de = new Date('2026-09-01');
      const ate = new Date('2026-09-30');

      await servico.porPergunta('form-1', { municipioCodigoIbge: 2927408, de, ate });

      expect(repositorio.totaisPorAlternativa).toHaveBeenCalledWith({
        formularioId: 'form-1',
        perguntaId: undefined,
        municipioCodigoIbge: 2927408,
        de,
        ate,
      });
    });
  });

  describe('indicadores', () => {
    it('usa o recorte filtrado nas válidas e a pesquisa inteira na integridade', async () => {
      repositorio.resumo.mockResolvedValue({
        respostasValidas: 500,
        respostasEmConferencia: 12,
        respostasInvalidadas: 3,
        municipiosAlcancados: 40,
        primeiraRespostaEm: new Date('2026-09-01'),
        ultimaRespostaEm: new Date('2026-09-20'),
      });
      repositorio.respostasValidasNoRecorte.mockResolvedValue(120);

      const indicadores = await servico.indicadores('form-1', { municipioCodigoIbge: 2927408 });

      expect(indicadores.respostasValidas).toBe(120);
      expect(indicadores.respostasEmConferencia).toBe(12);
      expect(indicadores.respostasInvalidadas).toBe(3);
      expect(indicadores.municipiosDaBahia).toBe(417);
    });

    it('responde zerado quando a agregação ainda não tem linha da pesquisa', async () => {
      repositorio.resumo.mockResolvedValue(null);
      repositorio.respostasValidasNoRecorte.mockResolvedValue(0);

      const indicadores = await servico.indicadores('form-1', {});

      expect(indicadores.respostasValidas).toBe(0);
      expect(indicadores.municipiosAlcancados).toBe(0);
      expect(indicadores.primeiraRespostaEm).toBeNull();
    });
  });

  describe('evolução', () => {
    it('acumula a série dia a dia', async () => {
      repositorio.evolucao.mockResolvedValue([
        { dia: '2026-09-01', respostasValidas: 10 },
        { dia: '2026-09-02', respostasValidas: 5 },
        { dia: '2026-09-03', respostasValidas: 8 },
      ]);

      const evolucao = await servico.evolucao('form-1', {});

      expect(evolucao.pontos.map((ponto) => ponto.acumulado)).toEqual([10, 15, 23]);
    });

    it('devolve série vazia sem quebrar', async () => {
      repositorio.evolucao.mockResolvedValue([]);

      await expect(servico.evolucao('form-1', {})).resolves.toEqual({ pontos: [] });
    });
  });
});
