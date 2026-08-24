import { BadRequestException, NotFoundException } from '@nestjs/common';
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
    rankingPorMunicipio: jest.fn(),
    cobertura: jest.fn(),
    cruzamento: jest.fn(),
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

describe('ResultadosService — ranking, cobertura e cruzamento', () => {
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
    rankingPorMunicipio: jest.fn(),
    cobertura: jest.fn(),
    cruzamento: jest.fn(),
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
      ],
    },
    {
      id: 'p2',
      enunciado: 'Faixa etária',
      tipo: PerguntaTipo.UNICA_ESCOLHA,
      ordem: 2,
      alternativas: [
        { id: 'b1', texto: '16 a 24', ordem: 1 },
        { id: 'b2', texto: '25 a 59', ordem: 2 },
      ],
    },
    {
      id: 'p3',
      enunciado: 'Comentário',
      tipo: PerguntaTipo.TEXTO_LIVRE,
      ordem: 3,
      alternativas: [],
    },
  ];

  beforeEach(async () => {
    jest.resetAllMocks();
    repositorio.formularioExiste.mockResolvedValue(true);
    repositorio.estrutura.mockResolvedValue(estrutura);

    const modulo = await Test.createTestingModule({
      providers: [ResultadosService, { provide: ResultadosRepository, useValue: repositorio }],
    }).compile();
    servico = modulo.get(ResultadosService);
  });

  describe('ranking por município', () => {
    it('numera as posições e deriva o percentual do total do recorte', async () => {
      repositorio.rankingPorMunicipio.mockResolvedValue([
        { codigoIbge: 2927408, nome: 'Salvador', respostasValidas: 150 },
        { codigoIbge: 2910800, nome: 'Feira de Santana', respostasValidas: 50 },
      ]);

      const ranking = await servico.ranking('form-1', {});

      expect(ranking.total).toBe(200);
      expect(ranking.municipios.map((m) => m.posicao)).toEqual([1, 2]);
      expect(ranking.municipios.map((m) => m.percentual)).toEqual([75, 25]);
    });

    it('não divide por zero quando o recorte não tem resposta', async () => {
      repositorio.rankingPorMunicipio.mockResolvedValue([]);

      const ranking = await servico.ranking('form-1', {});

      expect(ranking).toEqual({ total: 0, municipios: [] });
    });

    it('recusa pesquisa inexistente ou em rascunho', async () => {
      repositorio.formularioExiste.mockResolvedValue(false);

      await expect(servico.ranking('form-1', {})).rejects.toBeInstanceOf(NotFoundException);
      await expect(servico.cobertura('form-1')).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        servico.cruzamento('form-1', { perguntaAId: 'p1', perguntaBId: 'p2' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('cobertura', () => {
    it('conta alcançados e mantém o não alcançado na lista, com zero', async () => {
      repositorio.cobertura.mockResolvedValue([
        { codigoIbge: 2927408, nome: 'Salvador', respostasValidas: 10 },
        { codigoIbge: 2910800, nome: 'Feira de Santana', respostasValidas: 0 },
        { codigoIbge: 2905701, nome: 'Camaçari', respostasValidas: 0 },
      ]);

      const cobertura = await servico.cobertura('form-1');

      expect(cobertura.municipiosDaBahia).toBe(3);
      expect(cobertura.alcancados).toBe(1);
      expect(cobertura.percentualDeCobertura).toBeCloseTo(33.33, 2);
      expect(cobertura.municipios).toHaveLength(3);
    });
  });

  describe('cruzamento', () => {
    it('monta a matriz com percentual sobre o total da linha', async () => {
      repositorio.cruzamento.mockResolvedValue([
        { alternativaAId: 'a1', alternativaBId: 'b1', total: 30 },
        { alternativaAId: 'a1', alternativaBId: 'b2', total: 10 },
        { alternativaAId: 'a2', alternativaBId: 'b2', total: 20 },
      ]);

      const cruzamento = await servico.cruzamento('form-1', {
        perguntaAId: 'p1',
        perguntaBId: 'p2',
      });

      expect(cruzamento.total).toBe(60);
      expect(cruzamento.colunas.map((c) => c.texto)).toEqual(['16 a 24', '25 a 59']);

      const [primeira, segunda] = cruzamento.linhas;
      expect(primeira.total).toBe(40);
      expect(primeira.celulas.map((c) => c.percentual)).toEqual([75, 25]);
      // Combinação sem nenhuma resposta aparece zerada, não some da tabela.
      expect(segunda.celulas.map((c) => c.total)).toEqual([0, 20]);
      expect(segunda.celulas.map((c) => c.percentual)).toEqual([0, 100]);
    });

    it('recusa cruzar uma pergunta com ela mesma ou sem alternativas', async () => {
      await expect(
        servico.cruzamento('form-1', { perguntaAId: 'p1', perguntaBId: 'p1' }),
      ).rejects.toBeInstanceOf(BadRequestException);

      await expect(
        servico.cruzamento('form-1', { perguntaAId: 'p1', perguntaBId: 'p3' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('recusa pergunta que não é da pesquisa', async () => {
      await expect(
        servico.cruzamento('form-1', { perguntaAId: 'p1', perguntaBId: 'p9' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
