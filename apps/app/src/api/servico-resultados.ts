import { chamarComSessao } from './cliente-autenticado';
import { FormularioStatus, PerguntaTipo } from './servico-formularios';

/**
 * Resultados agregados. As mesmas rotas que o painel web consome — nenhuma
 * conta é refeita no aparelho: o que chega já vem das views materializadas.
 */

export interface FormularioComResultado {
  id: string;
  titulo: string;
  status: FormularioStatus;
  versao: number;
  publicadoEm: string | null;
  encerradoEm: string | null;
  respostasValidas: number;
}

export interface Indicadores {
  respostasValidas: number;
  respostasEmConferencia: number;
  respostasInvalidadas: number;
  municipiosAlcancados: number;
  municipiosDaBahia: number;
  primeiraRespostaEm: string | null;
  ultimaRespostaEm: string | null;
  atualizadoEm: string;
}

export interface AlternativaComResultado {
  alternativaId: string;
  texto: string;
  ordem: number;
  total: number;
  percentual: number;
}

export interface PerguntaComResultado {
  perguntaId: string;
  enunciado: string;
  tipo: PerguntaTipo;
  ordem: number;
  totalDeRespostas: number;
  alternativas: AlternativaComResultado[];
}

export interface PontoDaEvolucao {
  dia: string;
  respostasValidas: number;
  acumulado: number;
}

export interface MunicipioComResultado {
  codigoIbge: number;
  nome: string;
  respostasValidas: number;
}

/** Filtros que a tela usa hoje. Município e período ficam para quando houver volume. */
export interface FiltroDeResultado {
  municipioCodigoIbge?: number;
}

function comFiltro(caminho: string, filtro?: FiltroDeResultado): string {
  if (!filtro?.municipioCodigoIbge) {
    return caminho;
  }
  return `${caminho}?municipioCodigoIbge=${filtro.municipioCodigoIbge}`;
}

export const servicoResultados = {
  listarFormularios(): Promise<{ formularios: FormularioComResultado[] }> {
    return chamarComSessao('/resultados/formularios');
  },

  indicadores(formularioId: string, filtro?: FiltroDeResultado): Promise<Indicadores> {
    return chamarComSessao(comFiltro(`/resultados/${formularioId}/indicadores`, filtro));
  },

  perguntas(
    formularioId: string,
    filtro?: FiltroDeResultado,
  ): Promise<{ perguntas: PerguntaComResultado[] }> {
    return chamarComSessao(comFiltro(`/resultados/${formularioId}/perguntas`, filtro));
  },

  evolucao(formularioId: string): Promise<{ pontos: PontoDaEvolucao[] }> {
    return chamarComSessao(`/resultados/${formularioId}/evolucao`);
  },

  rankingDeMunicipios(
    formularioId: string,
  ): Promise<{ municipios: MunicipioComResultado[] }> {
    return chamarComSessao(`/resultados/${formularioId}/ranking-municipios`);
  },
};
