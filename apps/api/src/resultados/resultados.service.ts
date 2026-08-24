import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import {
  AlcancePorMunicipioResponse,
  CoberturaResponse,
  CruzamentoDto,
  CruzamentoResponse,
  EvolucaoResponse,
  FiltroDeResultadoDto,
  FormularioComResultadoResponse,
  IndicadoresResponse,
  RankingPorMunicipioResponse,
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

  /**
   * Ranking por município, com absoluto e percentual **derivado** do total de
   * respostas válidas do recorte. Empate desempata por nome, para a ordem não
   * mudar entre duas leituras iguais.
   */
  async ranking(
    formularioId: string,
    filtro: FiltroDeResultadoDto,
  ): Promise<RankingPorMunicipioResponse> {
    await this.exigirFormulario(formularioId);

    const recorte = this.montarRecorte(formularioId, filtro);
    const municipios = await this.repositorio.rankingPorMunicipio(recorte);
    const total = municipios.reduce((soma, municipio) => soma + municipio.respostasValidas, 0);

    return {
      total,
      municipios: municipios.map((municipio, indice) => ({
        posicao: indice + 1,
        ...municipio,
        percentual:
          total === 0 ? 0 : Math.round((municipio.respostasValidas / total) * 10_000) / 100,
      })),
    };
  }

  /**
   * Cobertura da Bahia. Município sem resposta aparece com zero — a tela de
   * cobertura existe justamente para mostrar o que ainda não foi alcançado.
   */
  async cobertura(formularioId: string): Promise<CoberturaResponse> {
    await this.exigirFormulario(formularioId);

    const municipios = await this.repositorio.cobertura(formularioId);
    const alcancados = municipios.filter((municipio) => municipio.respostasValidas > 0).length;

    return {
      municipiosDaBahia: municipios.length,
      alcancados,
      percentualDeCobertura:
        municipios.length === 0 ? 0 : Math.round((alcancados / municipios.length) * 10_000) / 100,
      municipios,
    };
  }

  /**
   * Cruzamento entre duas perguntas. O percentual de cada célula é sobre o
   * total da **linha**: é assim que se lê "intenção de voto por faixa etária".
   *
   * Alternativa sem nenhuma resposta continua na tabela, com zero: célula
   * faltando esconde informação.
   */
  async cruzamento(formularioId: string, filtro: CruzamentoDto): Promise<CruzamentoResponse> {
    await this.exigirFormulario(formularioId);

    if (filtro.perguntaAId === filtro.perguntaBId) {
      throw new BadRequestException('O cruzamento exige duas perguntas diferentes.');
    }

    const estrutura = await this.repositorio.estrutura(formularioId);
    const perguntaA = estrutura.find((pergunta) => pergunta.id === filtro.perguntaAId);
    const perguntaB = estrutura.find((pergunta) => pergunta.id === filtro.perguntaBId);

    if (!perguntaA || !perguntaB) {
      throw new NotFoundException('Pergunta não encontrada nesta pesquisa.');
    }
    if (perguntaA.alternativas.length === 0 || perguntaB.alternativas.length === 0) {
      throw new BadRequestException('Só é possível cruzar perguntas com alternativas.');
    }

    const linhas = await this.repositorio.cruzamento(
      formularioId,
      perguntaA.id,
      perguntaB.id,
      filtro.municipioCodigoIbge,
    );

    const porCelula = new Map(
      linhas.map((linha) => [`${linha.alternativaAId}:${linha.alternativaBId}`, linha.total]),
    );

    const tabela = perguntaA.alternativas.map((alternativaA) => {
      const celulas = perguntaB.alternativas.map((alternativaB) => ({
        alternativaId: alternativaB.id,
        texto: alternativaB.texto,
        total: porCelula.get(`${alternativaA.id}:${alternativaB.id}`) ?? 0,
      }));

      const total = celulas.reduce((soma, celula) => soma + celula.total, 0);

      return {
        alternativaId: alternativaA.id,
        texto: alternativaA.texto,
        total,
        celulas: celulas.map((celula) => ({
          ...celula,
          percentual: total === 0 ? 0 : Math.round((celula.total / total) * 10_000) / 100,
        })),
      };
    });

    return {
      perguntaLinhas: { perguntaId: perguntaA.id, enunciado: perguntaA.enunciado },
      perguntaColunas: { perguntaId: perguntaB.id, enunciado: perguntaB.enunciado },
      total: tabela.reduce((soma, linha) => soma + linha.total, 0),
      colunas: perguntaB.alternativas.map((alternativa) => ({
        alternativaId: alternativa.id,
        texto: alternativa.texto,
      })),
      linhas: tabela,
    };
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
