import { armazenamentoDeSessao } from '../auth/armazenamento';
import { ErroApi, chamar } from './cliente';

interface Opcoes {
  metodo?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  corpo?: unknown;
}

interface RespostaRenovacao {
  accessToken: string;
  refreshToken: string;
}

/** Lançado quando não há mais como renovar: a tela devolve o usuário ao login. */
export class SessaoEncerrada extends Error {
  constructor() {
    super('Sua sessão expirou. Entre novamente.');
    this.name = 'SessaoEncerrada';
  }
}

let renovacaoEmAndamento: Promise<string> | null = null;

/** Uma renovação por vez: várias telas em paralelo não disparam vários refresh. */
async function renovar(): Promise<string> {
  if (!renovacaoEmAndamento) {
    renovacaoEmAndamento = (async () => {
      const refreshToken = await armazenamentoDeSessao.lerRefreshToken();
      if (!refreshToken) {
        throw new SessaoEncerrada();
      }
      const renovado = await chamar<RespostaRenovacao>('/auth/renovar', {
        metodo: 'POST',
        corpo: { refreshToken },
      });
      await armazenamentoDeSessao.guardar(renovado.accessToken, renovado.refreshToken);
      return renovado.accessToken;
    })().finally(() => {
      renovacaoEmAndamento = null;
    });
  }
  return renovacaoEmAndamento;
}

/**
 * Chamada autenticada com uma tentativa de renovação.
 * O token sai do armazenamento seguro a cada chamada — nunca fica em variável global.
 */
export async function chamarComSessao<T>(caminho: string, opcoes: Opcoes = {}): Promise<T> {
  const token = await armazenamentoDeSessao.lerAccessToken();
  if (!token) {
    throw new SessaoEncerrada();
  }

  try {
    return await chamar<T>(caminho, { ...opcoes, token });
  } catch (falha) {
    if (!(falha instanceof ErroApi) || falha.status !== 401) {
      throw falha;
    }

    let novoToken: string;
    try {
      novoToken = await renovar();
    } catch {
      await armazenamentoDeSessao.limpar();
      throw new SessaoEncerrada();
    }

    return chamar<T>(caminho, { ...opcoes, token: novoToken });
  }
}
