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
