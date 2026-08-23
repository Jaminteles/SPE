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

/**
 * Cliente HTTP do painel.
 * Nunca coloca dado sensivel em query string; o token vai no cabecalho.
 */
export async function obter<T>(caminho: string, token?: string): Promise<T> {
  const resposta = await fetch(`${BASE_URL}${caminho}`, {
    headers: {
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!resposta.ok) {
    throw new ErroApi(resposta.status, `Falha na consulta a ${caminho}.`);
  }

  return (await resposta.json()) as T;
}
