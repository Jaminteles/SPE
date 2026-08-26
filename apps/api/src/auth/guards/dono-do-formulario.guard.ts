import { CanActivate, ExecutionContext, Injectable, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';

import { PrismaService } from '../../prisma/prisma.service';
import { CHAVE_DONO_DO_FORMULARIO } from '../decorators/dono-do-formulario.decorator';
import { PERFIS_QUE_VEEM_TUDO } from '../escopo-do-formulario';
import { UsuarioAutenticado } from '../tipos';

/**
 * Propriedade do formulário, verificada num lugar só.
 *
 * São 32 rotas em quatro controllers recebendo id de formulário. Espalhar a
 * checagem por elas seria garantir que alguma ficasse de fora — e a que ficasse
 * vazaria pesquisa de outro usuário sem barulho nenhum.
 *
 * O dono é lido do banco, nunca do token nem do corpo: o token diz quem pede,
 * o banco diz de quem é a pesquisa.
 */
@Injectable()
export class DonoDoFormularioGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const parametro = this.reflector.getAllAndOverride<string>(CHAVE_DONO_DO_FORMULARIO, [
      contexto.getHandler(),
      contexto.getClass(),
    ]);
    if (!parametro) {
      return true;
    }

    const requisicao = contexto
      .switchToHttp()
      .getRequest<Request & { usuario?: UsuarioAutenticado }>();
    const usuario = requisicao.usuario;

    if (usuario && PERFIS_QUE_VEEM_TUDO.includes(usuario.perfil)) {
      return true;
    }

    // O Express tipa parametro de rota como `string | string[]`; so o texto
    // simples serve de id, e qualquer outra coisa cai no 404 logo abaixo.
    const bruto: unknown = requisicao.params?.[parametro];
    const formularioId = typeof bruto === 'string' ? bruto : undefined;
    if (!usuario || !formularioId) {
      throw new NotFoundException('Formulário não encontrado.');
    }

    const formulario = await this.prisma.formulario.findUnique({
      where: { id: formularioId },
      select: { criadoPorId: true },
    });

    // Formulário sem dono é o que sobra quando a conta que o criou foi apagada
    // (`onDelete: SetNull`). Ninguém herda: só quem vê tudo continua alcançando.
    if (!formulario || formulario.criadoPorId !== usuario.id) {
      throw new NotFoundException('Formulário não encontrado.');
    }

    return true;
  }
}
