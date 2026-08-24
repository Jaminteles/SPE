import { sessao } from '../auth/sessao';

export type FormularioStatus = 'RASCUNHO' | 'EM_COLETA' | 'ENCERRADO';

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
  tipo: string;
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

export interface Filtros {
  perguntaId?: string;
  municipioCodigoIbge?: number;
  de?: string;
  ate?: string;
}

/** Monta a query só com o que está preenchido. */
function consulta(filtros: Filtros): string {
  const parametros = new URLSearchParams();
  if (filtros.perguntaId) parametros.set('perguntaId', filtros.perguntaId);
  if (filtros.municipioCodigoIbge) {
    parametros.set('municipioCodigoIbge', String(filtros.municipioCodigoIbge));
  }
  if (filtros.de) parametros.set('de', filtros.de);
  if (filtros.ate) parametros.set('ate', filtros.ate);

  const texto = parametros.toString();
  return texto ? `?${texto}` : '';
}

/**
 * Leitura de resultado. Tudo vem de agregação pré-calculada na API — o painel
 * nunca pede cálculo em cima da tabela bruta.
 */
export const servicoResultados = {
  formularios(): Promise<FormularioComResultado[]> {
    return sessao.chamarAutenticado('/resultados/formularios');
  },

  indicadores(formularioId: string, filtros: Filtros): Promise<Indicadores> {
    return sessao.chamarAutenticado(`/resultados/${formularioId}/indicadores${consulta(filtros)}`);
  },

  porPergunta(
    formularioId: string,
    filtros: Filtros,
  ): Promise<{ perguntas: PerguntaComResultado[] }> {
    return sessao.chamarAutenticado(`/resultados/${formularioId}/perguntas${consulta(filtros)}`);
  },

  evolucao(formularioId: string, filtros: Filtros): Promise<{ pontos: PontoDaEvolucao[] }> {
    return sessao.chamarAutenticado(`/resultados/${formularioId}/evolucao${consulta(filtros)}`);
  },

  municipios(formularioId: string): Promise<{ municipios: MunicipioComResultado[] }> {
    return sessao.chamarAutenticado(`/resultados/${formularioId}/municipios`);
  },
};

// ---------------------------------------------------------------------------
// Ranking, cobertura e cruzamento
// ---------------------------------------------------------------------------

export interface MunicipioRanqueado {
  posicao: number;
  codigoIbge: number;
  nome: string;
  respostasValidas: number;
  percentual: number;
}

export interface RankingPorMunicipio {
  total: number;
  municipios: MunicipioRanqueado[];
}

export interface Cobertura {
  municipiosDaBahia: number;
  alcancados: number;
  percentualDeCobertura: number;
  municipios: MunicipioComResultado[];
}

export interface CelulaDoCruzamento {
  alternativaId: string;
  texto: string;
  total: number;
  percentual: number;
}

export interface LinhaDoCruzamento {
  alternativaId: string;
  texto: string;
  total: number;
  celulas: CelulaDoCruzamento[];
}

export interface Cruzamento {
  perguntaLinhas: { perguntaId: string; enunciado: string };
  perguntaColunas: { perguntaId: string; enunciado: string };
  total: number;
  colunas: { alternativaId: string; texto: string }[];
  linhas: LinhaDoCruzamento[];
}

export const servicoApuracao = {
  ranking(formularioId: string, filtros: Filtros): Promise<RankingPorMunicipio> {
    return sessao.chamarAutenticado(
      `/resultados/${formularioId}/ranking-municipios${consulta(filtros)}`,
    );
  },

  cobertura(formularioId: string): Promise<Cobertura> {
    return sessao.chamarAutenticado(`/resultados/${formularioId}/cobertura`);
  },

  cruzamento(
    formularioId: string,
    perguntaAId: string,
    perguntaBId: string,
    municipioCodigoIbge?: number,
  ): Promise<Cruzamento> {
    const parametros = new URLSearchParams({ perguntaAId, perguntaBId });
    if (municipioCodigoIbge) {
      parametros.set('municipioCodigoIbge', String(municipioCodigoIbge));
    }
    return sessao.chamarAutenticado(
      `/resultados/${formularioId}/cruzamento?${parametros.toString()}`,
    );
  },
};

/** Query da exportação — os mesmos filtros da tela, para o arquivo bater com ela. */
export function consultaDeExportacao(filtros: Filtros): string {
  return consulta(filtros);
}
