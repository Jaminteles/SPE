const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api/v1';

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
  metodo?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  corpo?: unknown;
  token?: string;
}

interface CorpoErro {
  mensagem?: string | string[];
}

/**
 * Cliente HTTP do painel.
 *
 * O token vai sempre no cabeçalho — nunca em query string, que vaza em log de
 * proxy e histórico de navegador.
 */
export async function chamar<T>(caminho: string, opcoes: Opcoes = {}): Promise<T> {
  let resposta: Response;

  try {
    resposta = await fetch(`${BASE_URL}${caminho}`, {
      method: opcoes.metodo ?? 'GET',
      headers: {
        Accept: 'application/json',
        ...(opcoes.corpo ? { 'Content-Type': 'application/json' } : {}),
        ...(opcoes.token ? { Authorization: `Bearer ${opcoes.token}` } : {}),
      },
      body: opcoes.corpo ? JSON.stringify(opcoes.corpo) : undefined,
    });
  } catch {
    throw new ErroDeRede();
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

/**
 * Download autenticado. O token vai no cabeçalho, nunca na URL: link com
 * credencial em query string vaza em log de proxy e no histórico do navegador.
 */
export async function baixar(
  caminho: string,
  token: string,
): Promise<{ conteudo: Blob; nome: string }> {
  let resposta: Response;

  try {
    resposta = await fetch(`${BASE_URL}${caminho}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    throw new ErroDeRede();
  }

  if (!resposta.ok) {
    const corpo = (await resposta.json().catch(() => ({}))) as CorpoErro;
    const mensagem = Array.isArray(corpo.mensagem) ? corpo.mensagem[0] : corpo.mensagem;
    throw new ErroApi(resposta.status, mensagem ?? 'Não foi possível gerar o arquivo.');
  }

  const cabecalho = resposta.headers.get('Content-Disposition') ?? '';
  const encontrado = /filename="?([^";]+)"?/i.exec(cabecalho);

  return { conteudo: await resposta.blob(), nome: encontrado?.[1] ?? 'exportacao' };
}
