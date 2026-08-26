import { PerfilCodigo } from '@prisma/client';

import { UsuarioAutenticado } from './tipos';

/**
 * Perfis que enxergam a pesquisa de qualquer usuário.
 *
 * O Administrador porque precisa dar suporte e conter abuso — sem isso, um
 * problema relatado por um usuário seria impossível de investigar. O Analista
 * porque é conta criada por um Administrador justamente para ler o resultado da
 * equipe: escopo por dono deixaria essa conta sem enxergar nada.
 */
export const PERFIS_QUE_VEEM_TUDO: PerfilCodigo[] = [
  PerfilCodigo.ADMINISTRADOR,
  PerfilCodigo.ANALISTA,
];

/**
 * Dono ao qual a consulta fica restrita, ou `undefined` para "sem restrição".
 *
 * Mora aqui, e não espalhado pelos services, porque é a mesma regra que o
 * `DonoDoFormularioGuard` aplica nas rotas com id. Duas cópias da regra
 * divergiriam no primeiro perfil novo, e a divergência apareceria como pesquisa
 * de outro usuário numa lista.
 */
export function donoExigido(usuario: UsuarioAutenticado): string | undefined {
  return PERFIS_QUE_VEEM_TUDO.includes(usuario.perfil) ? undefined : usuario.id;
}
