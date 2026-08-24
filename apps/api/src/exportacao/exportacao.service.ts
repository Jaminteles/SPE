import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditoriaAcao } from '@prisma/client';

import { AuditoriaService } from '../auditoria/auditoria.service';
import { FiltroDeResultadoDto } from '../resultados/dto/resultados.dto';
import { ResultadosService } from '../resultados/resultados.service';
import { CsvProvider } from './csv.provider';
import { ExportacaoDto } from './dto/exportacao.dto';
import { PdfProvider } from './pdf.provider';
import { PlanilhaProvider } from './planilha.provider';
import { ArquivoExportado, FormatoDeExportacao, PacoteDeExportacao } from './tipos';

export interface AutorDaExportacao {
  id: string;
  nome: string;
}

/**
 * Exportação do resultado.
 *
 * O pacote é montado **pelo mesmo serviço que alimenta o painel**: é o que
 * garante que o total do arquivo bata com o total da tela. Nenhum cálculo é
 * refeito aqui, e nenhum percentual é fixo — todos vêm derivados de lá.
 *
 * Só agregado sai daqui. Não existe caminho que exporte resposta individual.
 */
@Injectable()
export class ExportacaoService {
  constructor(
    private readonly resultados: ResultadosService,
    private readonly csv: CsvProvider,
    private readonly planilha: PlanilhaProvider,
    private readonly pdf: PdfProvider,
    private readonly auditoria: AuditoriaService,
  ) {}

  async exportar(
    formato: FormatoDeExportacao,
    formularioId: string,
    filtro: ExportacaoDto,
    autor: AutorDaExportacao,
    tokenDaRequisicao: string,
  ): Promise<ArquivoExportado> {
    const pacote = await this.montarPacote(formularioId, filtro, autor);
    const nomeBase = this.nomeBase(pacote);

    const arquivo =
      formato === 'csv'
        ? this.csv.gerar(pacote, nomeBase)
        : formato === 'xlsx'
          ? await this.planilha.gerar(pacote, nomeBase)
          : await this.pdf.gerar(pacote, nomeBase, {
              token: tokenDaRequisicao,
              filtros: this.filtrosDaUrl(filtro),
            });

    // Auditoria depois de gerar: o que se audita é exportação concluída.
    // Nada aqui identifica respondente — só o recorte pedido e o volume.
    await this.auditoria.registrar({
      acao: AuditoriaAcao.EXPORTACAO_GERADA,
      entidade: 'formulario',
      entidadeId: formularioId,
      usuarioId: autor.id,
      detalhe: {
        formato,
        arquivo: arquivo.nome,
        bytes: arquivo.conteudo.length,
        respostasValidasNoRecorte: pacote.indicadores.respostasValidas,
        perguntaId: filtro.perguntaId ?? null,
        municipioCodigoIbge: filtro.municipioCodigoIbge ?? null,
        de: filtro.de ? filtro.de.toISOString() : null,
        ate: filtro.ate ? filtro.ate.toISOString() : null,
      },
    });

    return arquivo;
  }

  private async montarPacote(
    formularioId: string,
    filtro: ExportacaoDto,
    autor: AutorDaExportacao,
  ): Promise<PacoteDeExportacao> {
    const recorte: FiltroDeResultadoDto = {
      perguntaId: filtro.perguntaId,
      municipioCodigoIbge: filtro.municipioCodigoIbge,
      de: filtro.de,
      ate: filtro.ate,
    };

    const [formularios, indicadores, porPergunta, ranking, evolucao] = await Promise.all([
      this.resultados.formularios(),
      this.resultados.indicadores(formularioId, recorte),
      this.resultados.porPergunta(formularioId, recorte),
      this.resultados.ranking(formularioId, recorte),
      this.resultados.evolucao(formularioId, recorte),
    ]);

    const formulario = formularios.find((item) => item.id === formularioId);
    if (!formulario) {
      throw new NotFoundException('Pesquisa não encontrada ou ainda em rascunho.');
    }

    const municipioFiltrado = ranking.municipios.find(
      (municipio) => municipio.codigoIbge === filtro.municipioCodigoIbge,
    );
    const perguntaFiltrada = porPergunta.perguntas.find(
      (pergunta) => pergunta.perguntaId === filtro.perguntaId,
    );

    return {
      formulario: {
        id: formulario.id,
        titulo: formulario.titulo,
        status: formulario.status,
        versao: formulario.versao,
        publicadoEm: formulario.publicadoEm,
        encerradoEm: formulario.encerradoEm,
      },
      geradoEm: new Date(),
      geradoPor: autor.nome,
      recorte: {
        pergunta: perguntaFiltrada
          ? `${perguntaFiltrada.ordem}. ${perguntaFiltrada.enunciado}`
          : 'Todas',
        municipio: filtro.municipioCodigoIbge
          ? `${municipioFiltrado?.nome ?? 'Município'} (${filtro.municipioCodigoIbge})`
          : 'Todos os municípios da Bahia',
        periodo: this.periodo(filtro),
      },
      indicadores,
      perguntas: porPergunta.perguntas,
      municipios: ranking.municipios,
      totalDoRanking: ranking.total,
      evolucao: evolucao.pontos,
    };
  }

  private periodo(filtro: ExportacaoDto): string {
    const de = filtro.de ? filtro.de.toISOString().slice(0, 10) : null;
    const ate = filtro.ate ? filtro.ate.toISOString().slice(0, 10) : null;
    if (!de && !ate) {
      return 'Coleta inteira';
    }
    return `${de ?? 'início'} a ${ate ?? 'hoje'}`;
  }

  /** Filtros que o painel entende na URL de impressão. */
  private filtrosDaUrl(filtro: ExportacaoDto): Record<string, string> {
    const parametros: Record<string, string> = {};
    if (filtro.perguntaId) {
      parametros.perguntaId = filtro.perguntaId;
    }
    if (filtro.municipioCodigoIbge) {
      parametros.municipioCodigoIbge = String(filtro.municipioCodigoIbge);
    }
    if (filtro.de) {
      parametros.de = filtro.de.toISOString().slice(0, 10);
    }
    if (filtro.ate) {
      parametros.ate = filtro.ate.toISOString().slice(0, 10);
    }
    return parametros;
  }

  /**
   * Nome do arquivo, derivado do título. Só letras, números e hífen: o nome vai
   * para o cabeçalho `Content-Disposition`, e texto livre ali é convite a
   * injeção de cabeçalho.
   */
  private nomeBase(pacote: PacoteDeExportacao): string {
    const slug = pacote.formulario.titulo
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60);

    const dia = pacote.geradoEm.toISOString().slice(0, 10);
    return `pesquisa-${slug || 'sem-titulo'}-${dia}`;
  }
}
