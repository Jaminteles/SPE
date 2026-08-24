import { Injectable, NotFoundException } from '@nestjs/common';

import {
  AlcancePorMunicipioResponse,
  EvolucaoResponse,
  FiltroDeResultadoDto,
  FormularioComResultadoResponse,
  IndicadoresResponse,
  ResultadoPorPerguntaResponse,
} from './dto/resultados.dto';
import { Recorte, ResultadosRepository } from './resultados.repository';

@Injectable()
export class ResultadosService {
  constructor(private readonly repositorio: ResultadosRepository) {}

  async formularios(): Promise<FormularioComResultadoResponse[]> {
    return this.repositorio.formulariosComResultado();
  }

  async indicadores(
    formularioId: string,
    filtro: FiltroDeResultadoDto,
  ): Promise<IndicadoresResponse> {
    await this.exigirFormulario(formularioId);

    const [resumo, noRecorte, municipiosDaBahia] = await Promise.all([
      this.repositorio.resumo(formularioId),
      this.repositorio.respostasValidasNoRecorte(this.montarRecorte(formularioId, filtro)),
      this.repositorio.totalDeMunicipiosDaBahia(),
    ]);

    return {
      // O recorte filtrado manda no total; conferência e invalidadas são da
      // pesquisa inteira, porque medem integridade, não resultado.
      respostasValidas: noRecorte,
      respostasEmConferencia: resumo?.respostasEmConferencia ?? 0,
      respostasInvalidadas: resumo?.respostasInvalidadas ?? 0,
      municipiosAlcancados: resumo?.municipiosAlcancados ?? 0,
      municipiosDaBahia,
      primeiraRespostaEm: resumo?.primeiraRespostaEm ?? null,
      ultimaRespostaEm: resumo?.ultimaRespostaEm ?? null,
      atualizadoEm: new Date(),
    };
  }

  /**
   * Resultado por pergunta, com percentual **derivado** do total do recorte.
   * Alternativa sem nenhuma resposta aparece com zero: gráfico com barra
   * faltando esconde informação.
   */
  async porPergunta(
    formularioId: string,
    filtro: FiltroDeResultadoDto,
  ): Promise<ResultadoPorPerguntaResponse> {
    await this.exigirFormulario(formularioId);

    const recorte = this.montarRecorte(formularioId, filtro);
    const [estrutura, totais] = await Promise.all([
      this.repositorio.estrutura(formularioId),
      this.repositorio.totaisPorAlternativa(recorte),
    ]);

    const porAlternativa = new Map(
      totais.map((linha) => [`${linha.perguntaId}:${linha.alternativaId}`, linha.total]),
    );

    const perguntas = estrutura
      .filter((pergunta) => !filtro.perguntaId || pergunta.id === filtro.perguntaId)
      .filter((pergunta) => pergunta.alternativas.length > 0)
      .map((pergunta) => {
        const contagens = pergunta.alternativas.map((alternativa) => ({
          alternativaId: alternativa.id,
          texto: alternativa.texto,
          ordem: alternativa.ordem,
          total: porAlternativa.get(`${pergunta.id}:${alternativa.id}`) ?? 0,
        }));

        const totalDeRespostas = contagens.reduce((soma, item) => soma + item.total, 0);

        return {
          perguntaId: pergunta.id,
          enunciado: pergunta.enunciado,
          tipo: pergunta.tipo,
          ordem: pergunta.ordem,
          totalDeRespostas,
          alternativas: contagens.map((item) => ({
            ...item,
            percentual:
              totalDeRespostas === 0
                ? 0
                : Math.round((item.total / totalDeRespostas) * 10_000) / 100,
          })),
        };
      });

    return { perguntas };
  }

  async evolucao(formularioId: string, filtro: FiltroDeResultadoDto): Promise<EvolucaoResponse> {
    await this.exigirFormulario(formularioId);

    const serie = await this.repositorio.evolucao(this.montarRecorte(formularioId, filtro));

    let acumulado = 0;
    return {
      pontos: serie.map((ponto) => {
        acumulado += ponto.respostasValidas;
        return { ...ponto, acumulado };
      }),
    };
  }

  async alcance(formularioId: string): Promise<AlcancePorMunicipioResponse> {
    await this.exigirFormulario(formularioId);
    return { municipios: await this.repositorio.alcancePorMunicipio(formularioId) };
  }

  private montarRecorte(formularioId: string, filtro: FiltroDeResultadoDto): Recorte {
    return {
      formularioId,
      perguntaId: filtro.perguntaId,
      municipioCodigoIbge: filtro.municipioCodigoIbge,
      de: filtro.de,
      ate: filtro.ate,
    };
  }

  /** Rascunho não tem resultado, e pesquisa inexistente responde igual. */
  private async exigirFormulario(formularioId: string): Promise<void> {
    if (!(await this.repositorio.formularioExiste(formularioId))) {
      throw new NotFoundException('Pesquisa não encontrada ou ainda em rascunho.');
    }
  }
}
