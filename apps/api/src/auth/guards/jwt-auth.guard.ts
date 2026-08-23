import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { AuditoriaAcao, SessaoMotivo } from '@prisma/client';
import { Request } from 'express';

import { AuditoriaService } from '../../auditoria/auditoria.service';
import { CHAVE_ROTA_PUBLICA } from '../decorators/publico.decorator';
import { SessaoService } from '../sessao.service';
import { CargaToken, UsuarioAutenticado } from '../tipos';

/**
 * Guard global de autenticação: sem `@Publico()`, a rota exige token válido
 * e sessão viva. Negar é o padrão — nenhum endpoint fica exposto por
 * esquecimento de decorator.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly sessoes: SessaoService,
    private readonly auditoria: AuditoriaService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const publica = this.reflector.getAllAndOverride<boolean>(CHAVE_ROTA_PUBLICA, [
      contexto.getHandler(),
      contexto.getClass(),
    ]);
    if (publica) {
      return true;
    }

    const requisicao = contexto.switchToHttp().getRequest<Request>();
    const token = this.extrairToken(requisicao);
    if (!token) {
      throw new UnauthorizedException('Token ausente.');
    }

    let carga: CargaToken;
    try {
      carga = await this.jwt.verifyAsync<CargaToken>(token);
    } catch {
      throw new UnauthorizedException('Token inválido ou expirado.');
    }

    const sessao = await this.sessoes.validarAtividade(
      carga.sid,
      this.config.get<number>('SESSAO_INATIVIDADE_MIN', 30),
    );

    if (!sessao.valida) {
      if (sessao.motivo === SessaoMotivo.INATIVIDADE || sessao.motivo === SessaoMotivo.EXPIRACAO) {
        await this.auditoria.registrar({
          acao: AuditoriaAcao.SESSAO_EXPIRADA,
          entidade: 'sessao',
          entidadeId: carga.sid,
          usuarioId: carga.sub,
          detalhe: { motivo: sessao.motivo },
        });
      }
      throw new UnauthorizedException('Sessão encerrada. Entre novamente.');
    }

    // O usuário do token precisa ser o dono da sessão: token de um, sessão de outro, não passa.
    if (sessao.usuarioId !== carga.sub) {
      throw new UnauthorizedException('Sessão inválida.');
    }

    const usuario: UsuarioAutenticado = {
      id: sessao.usuarioId,
      perfil: sessao.perfil,
      sessaoId: carga.sid,
    };
    (requisicao as Request & { usuario: UsuarioAutenticado }).usuario = usuario;
    return true;
  }

  private extrairToken(requisicao: Request): string | null {
    const cabecalho = requisicao.headers.authorization;
    if (!cabecalho) {
      return null;
    }
    const [tipo, valor] = cabecalho.split(' ');
    return tipo === 'Bearer' && valor ? valor : null;
  }
}
