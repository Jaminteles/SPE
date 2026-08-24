import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AuditoriaAcao, FormularioStatus, PerguntaTipo } from '@prisma/client';

import { AuditoriaService } from '../auditoria/auditoria.service';
import { ResultadosService } from '../resultados/resultados.service';
import { CsvProvider } from './csv.provider';
import { ExportacaoService } from './exportacao.service';
import { PdfProvider } from './pdf.provider';
import { PlanilhaProvider } from './planilha.provider';

describe('ExportacaoService', () => {
  let servico: ExportacaoService;

  const resultados = {
    formularios: jest.fn(),
    indicadores: jest.fn(),
    porPergunta: jest.fn(),
    ranking: jest.fn(),
    evolucao: jest.fn(),
  };
  const auditoria = { registrar: jest.fn() };
  const pdf = { gerar: jest.fn() };

  const autor = { id: 'usuario-1', nome: 'Ana Analista' };

  beforeEach(async () => {
    jest.resetAllMocks();

    resultados.formularios.mockResolvedValue([
      {
        id: 'form-1',
        titulo: 'Pesquisa Eleitoral — Bahia 2026',
        status: FormularioStatus.EM_COLETA,
        versao: 1,
        publicadoEm: new Date('2026-08-01T12:00:00Z'),
        encerradoEm: null,
        respostasValidas: 200,
      },
    ]);
    resultados.indicadores.mockResolvedValue({
      respostasValidas: 200,
      respostasEmConferencia: 3,
      respostasInvalidadas: 1,
      municipiosAlcancados: 2,
      municipiosDaBahia: 417,
      primeiraRespostaEm: new Date('2026-08-02T10:00:00Z'),
      ultimaRespostaEm: new Date('2026-08-10T10:00:00Z'),
      atualizadoEm: new Date('2026-08-10T11:00:00Z'),
    });
    resultados.porPergunta.mockResolvedValue({
      perguntas: [
        {
          perguntaId: 'p1',
          enunciado: 'Em quem você votaria?',
          tipo: PerguntaTipo.UNICA_ESCOLHA,
          ordem: 1,
          totalDeRespostas: 200,
          alternativas: [
            { alternativaId: 'a1', texto: 'Candidato A', ordem: 1, total: 150, percentual: 75 },
            { alternativaId: 'a2', texto: '=CMD()', ordem: 2, total: 50, percentual: 25 },
          ],
        },
      ],
    });
    resultados.ranking.mockResolvedValue({
      total: 200,
      municipios: [
        {
          posicao: 1,
          codigoIbge: 2927408,
          nome: 'Salvador',
          respostasValidas: 150,
          percentual: 75,
        },
        {
          posicao: 2,
          codigoIbge: 2910800,
          nome: 'Feira de Santana',
          respostasValidas: 50,
          percentual: 25,
        },
      ],
    });
    resultados.evolucao.mockResolvedValue({
      pontos: [{ dia: '2026-08-02', respostasValidas: 200, acumulado: 200 }],
    });

    const modulo = await Test.createTestingModule({
      providers: [
        ExportacaoService,
        CsvProvider,
        PlanilhaProvider,
        { provide: ResultadosService, useValue: resultados },
        { provide: PdfProvider, useValue: pdf },
        { provide: AuditoriaService, useValue: auditoria },
      ],
    }).compile();

    servico = modulo.get(ExportacaoService);
  });

  it('exporta CSV com os mesmos totais que o painel mostra', async () => {
    const arquivo = await servico.exportar('csv', 'form-1', {}, autor, '');
    const texto = arquivo.conteudo.toString('utf8');

    expect(arquivo.nome).toMatch(/^pesquisa-pesquisa-eleitoral-bahia-2026-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(texto).toContain('"Candidato A"');
    expect(texto).toContain('"Salvador"');

    // A soma da coluna de município fecha com o total do recorte do painel.
    const totaisDeMunicipio = texto
      .split('\r\n')
      .filter((linha) => linha.startsWith('"municipio"'))
      .map((linha) => Number(linha.split(';')[6].replace(/"/g, '')));
    expect(totaisDeMunicipio.reduce((soma, valor) => soma + valor, 0)).toBe(200);
  });

  it('neutraliza texto que o Excel leria como fórmula', async () => {
    const arquivo = await servico.exportar('csv', 'form-1', {}, autor, '');

    expect(arquivo.conteudo.toString('utf8')).toContain(`"'=CMD()"`);
  });

  it('exporta XLSX com as quatro abas do painel', async () => {
    const arquivo = await servico.exportar('xlsx', 'form-1', {}, autor, '');

    expect(arquivo.tipo).toContain('spreadsheetml');
    expect(arquivo.conteudo.length).toBeGreaterThan(0);
  });

  it('registra a exportação em auditoria, com usuário e sem dado de respondente', async () => {
    await servico.exportar(
      'csv',
      'form-1',
      { municipioCodigoIbge: 2927408 },
      autor,
      'token-secreto',
    );

    expect(auditoria.registrar).toHaveBeenCalledTimes(1);
    const registro = auditoria.registrar.mock.calls[0][0];

    expect(registro.acao).toBe(AuditoriaAcao.EXPORTACAO_GERADA);
    expect(registro.usuarioId).toBe('usuario-1');
    expect(registro.entidadeId).toBe('form-1');
    expect(registro.detalhe.formato).toBe('csv');
    expect(registro.detalhe.municipioCodigoIbge).toBe(2927408);

    const serializado = JSON.stringify(registro);
    expect(serializado).not.toContain('token-secreto');
    expect(serializado.toLowerCase()).not.toContain('dispositivo');
    expect(serializado.toLowerCase()).not.toContain('latitude');
  });

  it('repassa o token de quem pediu para o renderizador, fora da URL', async () => {
    pdf.gerar.mockResolvedValue({
      nome: 'pesquisa.pdf',
      tipo: 'application/pdf',
      conteudo: Buffer.from('%PDF'),
    });

    await servico.exportar('pdf', 'form-1', { municipioCodigoIbge: 2927408 }, autor, 'token-1');

    const [, , contexto] = pdf.gerar.mock.calls[0];
    expect(contexto.token).toBe('token-1');
    expect(contexto.filtros).toEqual({ municipioCodigoIbge: '2927408' });
  });

  it('recusa exportar pesquisa inexistente ou em rascunho', async () => {
    resultados.formularios.mockResolvedValue([]);

    await expect(servico.exportar('csv', 'form-1', {}, autor, '')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(auditoria.registrar).not.toHaveBeenCalled();
  });
});
