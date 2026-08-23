import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PerfilCodigo } from '@prisma/client';
import { Request } from 'express';

import { CHAVE_PERFIS } from '../decorators/perfis.decorator';
import { CHAVE_ROTA_PUBLICA } from '../decorators/publico.decorator';
import { UsuarioAutenticado } from '../tipos';

/**
 * Verificação de permissão por perfil.
 *
 * O perfil considerado é o que o guard de autenticação leu do banco — nunca
 * um valor vindo do body, da query ou da rota. Trocar o id na URL não muda
 * quem o requisitante é.
 */
@Injectable()
export class PerfisGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(contexto: ExecutionContext): boolean {
    const publica = this.reflector.getAllAndOverride<boolean>(CHAVE_ROTA_PUBLICA, [
      contexto.getHandler(),
      contexto.getClass(),
    ]);
    if (publica) {
      return true;
    }

    const exigidos = this.reflector.getAllAndOverride<PerfilCodigo[]>(CHAVE_PERFIS, [
      contexto.getHandler(),
      contexto.getClass(),
    ]);
    if (!exigidos || exigidos.length === 0) {
      return true;
    }

    const requisicao = contexto
      .switchToHttp()
      .getRequest<Request & { usuario?: UsuarioAutenticado }>();
    const usuario = requisicao.usuario;

    if (!usuario || !exigidos.includes(usuario.perfil)) {
      throw new ForbiddenException('Seu perfil não tem acesso a este recurso.');
    }

    return true;
  }
}
