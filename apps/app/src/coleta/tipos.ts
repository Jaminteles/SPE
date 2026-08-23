import { PerguntaTipo } from '../api/servico-formularios';

export interface AlternativaPublica {
  id: string;
  texto: string;
  ordem: number;
}

export interface PerguntaPublica {
  id: string;
  enunciado: string;
  tipo: PerguntaTipo;
  obrigatoria: boolean;
  ordem: number;
  escalaMinimo: number | null;
  escalaMaximo: number | null;
  escalaRotuloMinimo: string | null;
  escalaRotuloMaximo: string | null;
  condicaoAlternativaId: string | null;
  condicaoPerguntaId: string | null;
  alternativas: AlternativaPublica[];
}

export interface FormularioPublico {
  titulo: string;
  descricao: string | null;
  token: string;
  /** Sessão de preenchimento: marca o início e é de uso único. */
  sessao: string;
  sessaoExpiraEm: string;
  exigeDesafioAntiRobo: boolean;
  perguntas: PerguntaPublica[];
}

/** Resposta local de uma pergunta, antes do envio. */
export type ValorDaResposta =
  | { tipo: 'alternativa'; alternativaId: string }
  | { tipo: 'alternativas'; alternativaIds: string[] }
  | { tipo: 'numero'; valor: number }
  | { tipo: 'texto'; valor: string };

export type RespostasEmAndamento = Record<string, ValorDaResposta | undefined>;

export interface ItemParaEnvio {
  perguntaId: string;
  alternativaId?: string;
  valorTexto?: string;
  valorNumero?: number;
}

/** Pacote enviado à API. Nenhum campo identifica o respondente. */
export interface PacoteDeEnvio {
  respostaId: string;
  sessao: string;
  consentimento: true;
  consentimentoEm: string;
  municipioCodigoIbge: number;
  dispositivoId: string;
  coletadoEm: string;
  latitude?: number;
  longitude?: number;
  origem: 'APLICATIVO';
  itens: ItemParaEnvio[];
}

export interface RespostaRegistrada {
  protocolo: string;
  status: 'VALIDA' | 'EM_CONFERENCIA' | 'INVALIDADA';
  origem: 'APLICATIVO' | 'WEB';
  recebidoEm: string;
}

export interface Municipio {
  codigoIbge: number;
  nome: string;
  uf: string;
}
