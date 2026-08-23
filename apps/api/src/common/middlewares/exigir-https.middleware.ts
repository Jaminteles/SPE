import { ForbiddenException } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

/**
 * Recusa requisição em texto claro quando o ambiente exige TLS.
 *
 * O TLS é terminado no proxy (nginx), que repassa o esquema em
 * `X-Forwarded-Proto`. Com `trust proxy` ligado, o Express já resolve
 * `req.protocol` a partir desse cabeçalho.
 *
 * Não redirecionamos: a API é consumida por app e painel, e redirect de
 * requisição não idempotente perde corpo e método. Falhar é mais honesto.
 */
export class ExigirHttpsMiddleware {
  constructor(private readonly obrigatorio: boolean) {}

  readonly uso = (requisicao: Request, _resposta: Response, proximo: NextFunction): void => {
    if (!this.obrigatorio || requisicao.secure || requisicao.protocol === 'https') {
      proximo();
      return;
    }
    throw new ForbiddenException('Esta API só aceita conexões HTTPS.');
  };
}
