import { ErroApi, baixar, chamar } from '../api/cliente';

export type Perfil = 'ADMINISTRADOR' | 'ANALISTA';

export interface UsuarioLogado {
  id: string;
  nome: string;
  email: string;
  perfil: Perfil;
}

interface RespostaDeToken {
  accessToken: string;
  refreshToken: string;
  expiraEmSegundos: number;
  perfil: Perfil;
}

const CHAVE_REFRESH = 'spe.painel.refresh';

/**
 * Sessão do painel, reaproveitando a autenticação da API.
 *
 * O **access token fica só em memória**: some ao recarregar a aba, o que reduz
 * a janela de um XSS. O refresh token vai para o `localStorage`, porque sem ele
 * não há como retomar a sessão depois do reload — e a API já o rotaciona a cada
 * uso e o invalida no logout.
 */
let accessToken: string | null = null;
let renovacaoEmAndamento: Promise<string> | null = null;

function guardarRefresh(token: string): void {
  localStorage.setItem(CHAVE_REFRESH, token);
}

function lerRefresh(): string | null {
  return localStorage.getItem(CHAVE_REFRESH);
}

function limpar(): void {
  accessToken = null;
  localStorage.removeItem(CHAVE_REFRESH);
}

/** Uma renovação por vez: várias telas em paralelo não disparam vários refresh. */
async function renovar(): Promise<string> {
  if (!renovacaoEmAndamento) {
    renovacaoEmAndamento = (async () => {
      const refreshToken = lerRefresh();
      if (!refreshToken) {
        throw new SessaoEncerrada();
      }
      const renovado = await chamar<RespostaDeToken>('/auth/renovar', {
        metodo: 'POST',
        corpo: { refreshToken },
      });
      accessToken = renovado.accessToken;
      guardarRefresh(renovado.refreshToken);
      return renovado.accessToken;
    })().finally(() => {
      renovacaoEmAndamento = null;
    });
  }
  return renovacaoEmAndamento;
}

export class SessaoEncerrada extends Error {
  constructor() {
    super('Sua sessão expirou. Entre novamente.');
    this.name = 'SessaoEncerrada';
  }
}

export const sessao = {
  async entrar(email: string, senha: string): Promise<UsuarioLogado> {
    const tokens = await chamar<RespostaDeToken>('/auth/login', {
      metodo: 'POST',
      corpo: { email: email.trim().toLowerCase(), senha },
    });

    accessToken = tokens.accessToken;
    guardarRefresh(tokens.refreshToken);
    return this.usuarioAtual();
  },

  usuarioAtual(): Promise<UsuarioLogado> {
    return this.chamarAutenticado<UsuarioLogado>('/auth/eu');
  },

  /** Retoma a sessão ao abrir o painel. Falhou, começa deslogado. */
  async retomar(): Promise<UsuarioLogado | null> {
    if (!lerRefresh()) {
      return null;
    }
    try {
      await renovar();
      return await this.usuarioAtual();
    } catch {
      limpar();
      return null;
    }
  },

  async sair(): Promise<void> {
    try {
      if (accessToken) {
        await chamar<void>('/auth/logout', { metodo: 'POST', token: accessToken });
      }
    } catch {
      // A sessão pode já ter morrido no servidor; o que importa é limpar aqui.
    }
    limpar();
  },

  /**
   * Adota um access token já emitido, sem passar pelo login.
   *
   * Existe para o modo de impressão: o renderizador de PDF injeta no contexto
   * da página o token de quem pediu a exportação. O valor fica só em memória —
   * nunca vai para `localStorage`, para a URL nem para log.
   */
  adotarToken(token: string): void {
    accessToken = token;
  },

  /** Download autenticado, com uma tentativa de renovação. */
  async baixarAutenticado(caminho: string): Promise<{ conteudo: Blob; nome: string }> {
    if (!accessToken) {
      await renovar();
    }

    try {
      return await baixar(caminho, accessToken ?? '');
    } catch (falha) {
      if (!(falha instanceof ErroApi) || falha.status !== 401) {
        throw falha;
      }

      try {
        return await baixar(caminho, await renovar());
      } catch {
        limpar();
        throw new SessaoEncerrada();
      }
    }
  },

  /** Chamada autenticada com uma tentativa de renovação. */
  async chamarAutenticado<T>(caminho: string, opcoes: { metodo?: 'GET' | 'POST' } = {}): Promise<T> {
    if (!accessToken) {
      await renovar();
    }

    try {
      return await chamar<T>(caminho, { ...opcoes, token: accessToken ?? undefined });
    } catch (falha) {
      if (!(falha instanceof ErroApi) || falha.status !== 401) {
        throw falha;
      }

      try {
        const novo = await renovar();
        return await chamar<T>(caminho, { ...opcoes, token: novo });
      } catch {
        limpar();
        throw new SessaoEncerrada();
      }
    }
  },
};
