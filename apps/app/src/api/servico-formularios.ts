import { chamarComSessao } from './cliente-autenticado';

export type FormularioStatus = 'RASCUNHO' | 'EM_COLETA' | 'ENCERRADO';

export type PerguntaTipo =
  | 'UNICA_ESCOLHA'
  | 'MULTIPLA_ESCOLHA'
  | 'ESCALA'
  | 'TEXTO_LIVRE'
  | 'NUMERO';

export const ROTULO_DO_TIPO: Record<PerguntaTipo, string> = {
  UNICA_ESCOLHA: 'Escolha única',
  MULTIPLA_ESCOLHA: 'Múltipla escolha',
  ESCALA: 'Escala / nota',
  TEXTO_LIVRE: 'Texto livre',
  NUMERO: 'Número',
};

export const ROTULO_DO_STATUS: Record<FormularioStatus, string> = {
  RASCUNHO: 'Rascunho',
  EM_COLETA: 'Em coleta',
  ENCERRADO: 'Encerrado',
};

/** Tipos que se respondem escolhendo alternativa cadastrada. */
export const TIPOS_COM_ALTERNATIVA: PerguntaTipo[] = ['UNICA_ESCOLHA', 'MULTIPLA_ESCOLHA'];

export interface Alternativa {
  id: string;
  texto: string;
  ordem: number;
}

export interface Pergunta {
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
  alternativas: Alternativa[];
}

export interface FormularioResumo {
  id: string;
  titulo: string;
  descricao: string | null;
  status: FormularioStatus;
  versao: number;
  vigenciaInicio: string | null;
  vigenciaFim: string | null;
  publicadoEm: string | null;
  encerradoEm: string | null;
  criadoEm: string;
  tokenPublico: string | null;
  totalPerguntas: number;
}

export interface Formulario extends FormularioResumo {
  perguntas: Pergunta[];
}

export interface EntradaFormulario {
  titulo?: string;
  descricao?: string;
  vigenciaInicio?: string;
  vigenciaFim?: string;
}

export interface EntradaPergunta {
  enunciado: string;
  tipo?: PerguntaTipo;
  obrigatoria?: boolean;
  escalaMinimo?: number;
  escalaMaximo?: number;
  escalaRotuloMinimo?: string;
  escalaRotuloMaximo?: string;
  /** Alternativa que habilita a pergunta. null remove a condição. */
  condicaoAlternativaId?: string | null;
}

export interface AcessoDeColeta {
  url: string;
  qrCodeSvg: string;
  token: string;
}

const BASE = '/formularios';

/**
 * Área do Administrador. A API é quem manda: o app esconde o que o perfil não
 * pode fazer, mas quem recusa de fato é o guard do servidor.
 */
export const servicoFormularios = {
  listar(): Promise<{ itens: FormularioResumo[]; total: number }> {
    return chamarComSessao(`${BASE}?limite=200`);
  },

  buscar(id: string): Promise<Formulario> {
    return chamarComSessao(`${BASE}/${id}`);
  },

  criar(entrada: EntradaFormulario): Promise<FormularioResumo> {
    return chamarComSessao(BASE, { metodo: 'POST', corpo: entrada });
  },

  atualizar(id: string, entrada: EntradaFormulario): Promise<FormularioResumo> {
    return chamarComSessao(`${BASE}/${id}`, { metodo: 'PATCH', corpo: entrada });
  },

  excluir(id: string): Promise<void> {
    return chamarComSessao(`${BASE}/${id}`, { metodo: 'DELETE' });
  },

  acesso(id: string): Promise<AcessoDeColeta> {
    return chamarComSessao(`${BASE}/${id}/acesso`);
  },

  duplicar(id: string, titulo?: string): Promise<FormularioResumo> {
    return chamarComSessao(`${BASE}/${id}/duplicar`, {
      metodo: 'POST',
      corpo: titulo ? { titulo } : {},
    });
  },

  publicar(id: string): Promise<FormularioResumo> {
    return chamarComSessao(`${BASE}/${id}/publicar`, { metodo: 'POST' });
  },

  encerrar(id: string): Promise<FormularioResumo> {
    return chamarComSessao(`${BASE}/${id}/encerrar`, { metodo: 'POST' });
  },

  criarPergunta(formularioId: string, entrada: EntradaPergunta): Promise<Pergunta> {
    return chamarComSessao(`${BASE}/${formularioId}/perguntas`, {
      metodo: 'POST',
      corpo: entrada,
    });
  },

  atualizarPergunta(
    formularioId: string,
    perguntaId: string,
    entrada: Omit<EntradaPergunta, 'tipo'>,
  ): Promise<Pergunta> {
    return chamarComSessao(`${BASE}/${formularioId}/perguntas/${perguntaId}`, {
      metodo: 'PATCH',
      corpo: entrada,
    });
  },

  excluirPergunta(formularioId: string, perguntaId: string): Promise<void> {
    return chamarComSessao(`${BASE}/${formularioId}/perguntas/${perguntaId}`, {
      metodo: 'DELETE',
    });
  },

  reordenarPerguntas(formularioId: string, ids: string[]): Promise<Pergunta[]> {
    return chamarComSessao(`${BASE}/${formularioId}/perguntas/ordem`, {
      metodo: 'PATCH',
      corpo: { ids },
    });
  },

  criarAlternativa(formularioId: string, perguntaId: string, texto: string): Promise<Alternativa> {
    return chamarComSessao(`${BASE}/${formularioId}/perguntas/${perguntaId}/alternativas`, {
      metodo: 'POST',
      corpo: { texto },
    });
  },

  atualizarAlternativa(
    formularioId: string,
    perguntaId: string,
    alternativaId: string,
    texto: string,
  ): Promise<Alternativa> {
    return chamarComSessao(
      `${BASE}/${formularioId}/perguntas/${perguntaId}/alternativas/${alternativaId}`,
      { metodo: 'PATCH', corpo: { texto } },
    );
  },

  excluirAlternativa(
    formularioId: string,
    perguntaId: string,
    alternativaId: string,
  ): Promise<void> {
    return chamarComSessao(
      `${BASE}/${formularioId}/perguntas/${perguntaId}/alternativas/${alternativaId}`,
      { metodo: 'DELETE' },
    );
  },

  reordenarAlternativas(
    formularioId: string,
    perguntaId: string,
    ids: string[],
  ): Promise<Alternativa[]> {
    return chamarComSessao(
      `${BASE}/${formularioId}/perguntas/${perguntaId}/alternativas/ordem`,
      { metodo: 'PATCH', corpo: { ids } },
    );
  },
};
