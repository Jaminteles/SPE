import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import { Request } from 'express';

/**
 * Entrega o access token cru da requisicao — apenas para quem precisa repassar
 * a identidade de quem pediu a um renderizador do proprio painel.
 *
 * O valor nunca vai para log, URL, banco ou resposta de API.
 */
export const TokenDaRequisicao = createParamDecorator(
  (_dados: unknown, contexto: ExecutionContext): string => {
    const requisicao = contexto.switchToHttp().getRequest<Request>();
    const cabecalho = requisicao.headers.authorization ?? '';
    return cabecalho.toLowerCase().startsWith('bearer ') ? cabecalho.slice(7).trim() : '';
  },
);
