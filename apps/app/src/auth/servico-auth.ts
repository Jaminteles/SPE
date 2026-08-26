import { chamar } from '../api/cliente';
import { armazenamentoDeSessao } from './armazenamento';

export type Perfil = 'ADMINISTRADOR' | 'ANALISTA' | 'PESQUISADOR';

export interface RespostaLogin {
  accessToken: string;
  refreshToken: string;
  expiraEmSegundos: number;
  perfil: Perfil;
}

export interface UsuarioLogado {
  id: string;
  nome: string;
  email: string;
  perfil: Perfil;
}

/**
 * Fluxo de autenticação do aplicativo.
 * Nenhuma função aqui registra senha ou token — nem em log de desenvolvimento.
 */
export const servicoAuth = {
  async entrar(email: string, senha: string): Promise<UsuarioLogado> {
    const tokens = await chamar<RespostaLogin>('/auth/login', {
      metodo: 'POST',
      corpo: { email: email.trim().toLowerCase(), senha },
    });

    await armazenamentoDeSessao.guardar(tokens.accessToken, tokens.refreshToken);
    return this.carregarUsuario(tokens.accessToken);
  },

  async carregarUsuario(accessToken: string): Promise<UsuarioLogado> {
    return chamar<UsuarioLogado>('/auth/eu', { token: accessToken });
  },

  /** Retoma a sessão guardada na abertura do app. Falhou, começa deslogado. */
  async retomarSessao(): Promise<UsuarioLogado | null> {
    const accessToken = await armazenamentoDeSessao.lerAccessToken();
    if (!accessToken) {
      return null;
    }

    try {
      return await this.carregarUsuario(accessToken);
    } catch {
      const refreshToken = await armazenamentoDeSessao.lerRefreshToken();
      if (!refreshToken) {
        await armazenamentoDeSessao.limpar();
        return null;
      }
      try {
        const renovado = await chamar<RespostaLogin>('/auth/renovar', {
          metodo: 'POST',
          corpo: { refreshToken },
        });
        await armazenamentoDeSessao.guardar(renovado.accessToken, renovado.refreshToken);
        return await this.carregarUsuario(renovado.accessToken);
      } catch {
        await armazenamentoDeSessao.limpar();
        return null;
      }
    }
  },

  async sair(): Promise<void> {
    const accessToken = await armazenamentoDeSessao.lerAccessToken();
    if (accessToken) {
      try {
        await chamar<void>('/auth/logout', { metodo: 'POST', token: accessToken });
      } catch {
        // Sessão já pode ter morrido no servidor; o que importa é limpar o aparelho.
      }
    }
    await armazenamentoDeSessao.limpar();
  },
};
