import { ExecutionContext, createParamDecorator } from '@nestjs/common';

import { UsuarioAutenticado } from '../tipos';

/**
 * Entrega a identidade autenticada, sempre vinda do token validado.
 * Nenhuma rota confia em id de usuario que venha do body, da rota ou da query.
 */
export const UsuarioAtual = createParamDecorator(
  (_dados: unknown, contexto: ExecutionContext): UsuarioAutenticado => {
    return contexto.switchToHttp().getRequest().usuario;
  },
);
