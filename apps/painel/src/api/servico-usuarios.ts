import { Perfil, sessao } from '../auth/sessao';

export interface Usuario {
  id: string;
  nome: string;
  email: string;
  ativo: boolean;
  perfil: Perfil;
  ultimoLoginEm: string | null;
  criadoEm: string;
}

export interface ListaDeUsuarios {
  itens: Usuario[];
  total: number;
}

/**
 * Administração de contas. Todas as rotas exigem perfil Administrador — a tela
 * nem aparece para os outros, mas quem recusa de fato é o guard da API.
 *
 * Perfil e senha têm rota própria, e não entram no `atualizar`: cada um tem
 * auditoria própria do lado da API, e juntá-los aqui esconderia no log uma
 * mudança de permissão dentro de uma edição de nome.
 */
export const servicoUsuarios = {
  listar(): Promise<ListaDeUsuarios> {
    return sessao.chamarAutenticado('/usuarios?limite=200');
  },

  criar(dados: {
    nome: string;
    email: string;
    senha: string;
    perfil: Perfil;
  }): Promise<Usuario> {
    return sessao.chamarAutenticado('/usuarios', { metodo: 'POST', corpo: dados });
  },

  renomear(id: string, nome: string): Promise<Usuario> {
    return sessao.chamarAutenticado(`/usuarios/${id}`, { metodo: 'PATCH', corpo: { nome } });
  },

  definirAtivo(id: string, ativo: boolean): Promise<Usuario> {
    return sessao.chamarAutenticado(`/usuarios/${id}`, { metodo: 'PATCH', corpo: { ativo } });
  },

  alterarPerfil(id: string, perfil: Perfil): Promise<Usuario> {
    return sessao.chamarAutenticado(`/usuarios/${id}/perfil`, {
      metodo: 'PATCH',
      corpo: { perfil },
    });
  },

  redefinirSenha(id: string, novaSenha: string): Promise<void> {
    return sessao.chamarAutenticado(`/usuarios/${id}/senha`, {
      metodo: 'PATCH',
      corpo: { novaSenha },
    });
  },
};
