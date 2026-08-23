import { PerfilCodigo } from '@prisma/client';

/** Identidade que os guards colocam na requisicao. Nunca carrega senha nem token. */
export interface UsuarioAutenticado {
  id: string;
  perfil: PerfilCodigo;
  sessaoId: string;
}

/** Conteudo assinado no access token. */
export interface CargaToken {
  sub: string;
  perfil: PerfilCodigo;
  sid: string;
}
