import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';

import { ArquivoExportado, PacoteDeExportacao } from './tipos';

/**
 * Exportação em XLSX com ExcelJS (decisão do backlog).
 *
 * Uma aba por bloco do painel, com número saindo como número — planilha em que
 * o total vem como texto não soma, e a conferência com o painel é justamente
 * somar.
 */
@Injectable()
export class PlanilhaProvider {
  async gerar(pacote: PacoteDeExportacao, nomeBase: string): Promise<ArquivoExportado> {
    const planilha = new ExcelJS.Workbook();
    planilha.creator = 'Sistema de Pesquisa Eleitoral';
    planilha.created = pacote.geradoEm;

    this.abaResumo(planilha, pacote);
    this.abaPerguntas(planilha, pacote);
    this.abaMunicipios(planilha, pacote);
    this.abaEvolucao(planilha, pacote);

    const conteudo = await planilha.xlsx.writeBuffer();

    return {
      nome: `${nomeBase}.xlsx`,
      tipo: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      conteudo: Buffer.from(conteudo),
    };
  }

  private abaResumo(planilha: ExcelJS.Workbook, pacote: PacoteDeExportacao): void {
    const aba = planilha.addWorksheet('Resumo');
    aba.columns = [
      { header: 'Informação', key: 'chave', width: 34 },
      { header: 'Valor', key: 'valor', width: 46 },
    ];

    const { indicadores, recorte, formulario } = pacote;
    const linhas: [string, string | number][] = [
      ['Pesquisa', formulario.titulo],
      ['Situação', formulario.status],
      ['Versão', formulario.versao],
      ['Publicada em', this.dataHora(formulario.publicadoEm)],
      ['Encerrada em', this.dataHora(formulario.encerradoEm)],
      ['Filtro — pergunta', recorte.pergunta],
      ['Filtro — município', recorte.municipio],
      ['Filtro — período', recorte.periodo],
      ['Respostas válidas no recorte', indicadores.respostasValidas],
      ['Respostas em conferência (pesquisa inteira)', indicadores.respostasEmConferencia],
      ['Respostas invalidadas (pesquisa inteira)', indicadores.respostasInvalidadas],
      ['Municípios alcançados', indicadores.municipiosAlcancados],
      ['Municípios da Bahia', indicadores.municipiosDaBahia],
      ['Agregação atualizada em', this.dataHora(indicadores.atualizadoEm)],
      ['Arquivo gerado em', this.dataHora(pacote.geradoEm)],
      ['Gerado por', pacote.geradoPor],
    ];

    for (const [chave, valor] of linhas) {
      aba.addRow({ chave, valor });
    }
    aba.getRow(1).font = { bold: true };
  }

  private abaPerguntas(planilha: ExcelJS.Workbook, pacote: PacoteDeExportacao): void {
    const aba = planilha.addWorksheet('Por pergunta');
    aba.columns = [
      { header: 'Ordem', key: 'ordem', width: 8 },
      { header: 'Pergunta', key: 'pergunta', width: 60 },
      { header: 'Alternativa', key: 'alternativa', width: 40 },
      { header: 'Respostas', key: 'total', width: 12 },
      { header: '% da pergunta', key: 'percentual', width: 14 },
    ];

    for (const pergunta of pacote.perguntas) {
      for (const alternativa of pergunta.alternativas) {
        aba.addRow({
          ordem: pergunta.ordem,
          pergunta: pergunta.enunciado,
          alternativa: alternativa.texto,
          total: alternativa.total,
          percentual: alternativa.percentual,
        });
      }
    }
    aba.getRow(1).font = { bold: true };
    aba.getColumn('percentual').numFmt = '0.00';
  }

  private abaMunicipios(planilha: ExcelJS.Workbook, pacote: PacoteDeExportacao): void {
    const aba = planilha.addWorksheet('Municípios');
    aba.columns = [
      { header: 'Posição', key: 'posicao', width: 10 },
      { header: 'Código IBGE', key: 'codigoIbge', width: 14 },
      { header: 'Município', key: 'nome', width: 34 },
      { header: 'Respostas válidas', key: 'respostasValidas', width: 18 },
      { header: '% do recorte', key: 'percentual', width: 14 },
    ];

    for (const municipio of pacote.municipios) {
      aba.addRow(municipio);
    }
    aba.addRow({ nome: 'Total', respostasValidas: pacote.totalDoRanking });
    aba.getRow(1).font = { bold: true };
    aba.lastRow!.font = { bold: true };
    aba.getColumn('percentual').numFmt = '0.00';
  }

  private abaEvolucao(planilha: ExcelJS.Workbook, pacote: PacoteDeExportacao): void {
    const aba = planilha.addWorksheet('Evolução');
    aba.columns = [
      { header: 'Dia', key: 'dia', width: 14 },
      { header: 'Respostas válidas', key: 'respostasValidas', width: 18 },
      { header: 'Acumulado', key: 'acumulado', width: 14 },
    ];

    for (const ponto of pacote.evolucao) {
      aba.addRow(ponto);
    }
    aba.getRow(1).font = { bold: true };
  }

  private dataHora(valor: Date | null): string {
    return valor ? new Date(valor).toISOString() : '—';
  }
}
