import { Injectable } from '@nestjs/common';

import { ArquivoExportado, PacoteDeExportacao } from './tipos';

/** Separador e decimal em pt-BR: o arquivo é aberto no Excel brasileiro. */
const SEPARADOR = ';';
const BOM = '\uFEFF';

/**
 * Exportação em CSV.
 *
 * Uma tabela só, normalizada, com a coluna `secao` dizendo de onde a linha
 * veio. Planilha com blocos empilhados é bonita na tela e inútil para quem vai
 * reprocessar o dado.
 */
@Injectable()
export class CsvProvider {
  private static readonly COLUNAS = [
    'secao',
    'pergunta',
    'alternativa',
    'municipio_codigo_ibge',
    'municipio',
    'dia',
    'total',
    'percentual',
  ];

  gerar(pacote: PacoteDeExportacao, nomeBase: string): ArquivoExportado {
    const linhas: string[][] = [CsvProvider.COLUNAS];

    for (const pergunta of pacote.perguntas) {
      for (const alternativa of pergunta.alternativas) {
        linhas.push([
          'pergunta',
          `${pergunta.ordem}. ${pergunta.enunciado}`,
          alternativa.texto,
          '',
          '',
          '',
          String(alternativa.total),
          this.numero(alternativa.percentual),
        ]);
      }
    }

    for (const municipio of pacote.municipios) {
      linhas.push([
        'municipio',
        '',
        '',
        String(municipio.codigoIbge),
        municipio.nome,
        '',
        String(municipio.respostasValidas),
        this.numero(municipio.percentual),
      ]);
    }

    for (const ponto of pacote.evolucao) {
      linhas.push(['evolucao', '', '', '', '', ponto.dia, String(ponto.respostasValidas), '']);
    }

    const conteudo =
      BOM +
      linhas.map((linha) => linha.map((celula) => this.campo(celula)).join(SEPARADOR)).join('\r\n');

    return {
      nome: `${nomeBase}.csv`,
      tipo: 'text/csv; charset=utf-8',
      conteudo: Buffer.from(conteudo, 'utf8'),
    };
  }

  private numero(valor: number): string {
    return valor.toFixed(2).replace('.', ',');
  }

  /**
   * Escapa o campo. O `'` na frente de `=`, `+`, `-` e `@` evita que o Excel
   * interprete texto vindo do banco como fórmula (CSV injection).
   */
  private campo(valor: string): string {
    const seguro = /^[=+\-@\t\r]/.test(valor) ? `'${valor}` : valor;
    return `"${seguro.replace(/"/g, '""')}"`;
  }
}
