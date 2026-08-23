import { ambiente } from '../config/ambiente';

export class ErroApi extends Error {
  constructor(
    readonly status: number,
    mensagem: string,
  ) {
    super(mensagem);
    this.name = 'ErroApi';
  }
}

export class ErroDeRede extends Error {
  constructor() {
    super('Não foi possível falar com o servidor. Verifique a conexão.');
    this.name = 'ErroDeRede';
  }
}

interface Opcoes {
  metodo?: 'GET' | 'POST' | 'PATCH';
  corpo?: unknown;
  token?: string;
}

interface CorpoErro {
  mensagem?: string | string[];
}

/**
 * Cliente HTTP do aplicativo, com timeout.
 * O token vai sempre no cabeçalho: nunca em URL, nunca em query param.
 */
export async function chamar<T>(caminho: string, opcoes: Opcoes = {}): Promise<T> {
  const controlador = new AbortController();
  const timer = setTimeout(() => controlador.abort(), ambiente.timeoutMs);

  let resposta: Response;
  try {
    resposta = await fetch(`${ambiente.apiUrl}${caminho}`, {
      method: opcoes.metodo ?? 'GET',
      signal: controlador.signal,
      headers: {
        Accept: 'application/json',
        ...(opcoes.corpo ? { 'Content-Type': 'application/json' } : {}),
        ...(opcoes.token ? { Authorization: `Bearer ${opcoes.token}` } : {}),
      },
      body: opcoes.corpo ? JSON.stringify(opcoes.corpo) : undefined,
    });
  } catch {
    throw new ErroDeRede();
  } finally {
    clearTimeout(timer);
  }

  if (resposta.status === 204) {
    return undefined as T;
  }

  const corpo = (await resposta.json().catch(() => ({}))) as CorpoErro;

  if (!resposta.ok) {
    const mensagem = Array.isArray(corpo.mensagem) ? corpo.mensagem[0] : corpo.mensagem;
    throw new ErroApi(resposta.status, mensagem ?? 'Não foi possível concluir a operação.');
  }

  return corpo as T;
}
