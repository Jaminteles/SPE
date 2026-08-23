import { Injectable } from '@nestjs/common';
import { PerfilCodigo, SessaoMotivo } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';

import { PrismaService } from '../prisma/prisma.service';

export interface SessaoCriada {
  sessaoId: string;
  refreshToken: string;
  expiraEm: Date;
}

export type ResultadoValidacao =
  | { valida: true; usuarioId: string; perfil: PerfilCodigo }
  | { valida: false; motivo: SessaoMotivo };

const MS_POR_MINUTO = 60_000;
const MS_POR_HORA = 3_600_000;

/**
 * Ciclo de vida da sessão.
 *
 * O refresh token só existe em claro no cliente; o banco guarda SHA-256.
 * A sessão morre por inatividade, por expiração absoluta ou por encerramento
 * explícito — e o registro permanece, com data e motivo.
 */
@Injectable()
export class SessaoService {
  /** Evita escrita a cada requisição: a atividade é gravada em janelas. */
  private static readonly JANELA_ATUALIZACAO_MS = 60_000;

  constructor(private readonly prisma: PrismaService) {}

  static hashDeToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  async criar(usuarioId: string, duracaoAbsolutaHoras: number): Promise<SessaoCriada> {
    const refreshToken = randomBytes(32).toString('base64url');
    const expiraEm = new Date(Date.now() + duracaoAbsolutaHoras * MS_POR_HORA);

    const sessao = await this.prisma.sessao.create({
      data: {
        usuarioId,
        refreshTokenHash: SessaoService.hashDeToken(refreshToken),
        expiraEm,
      },
      select: { id: true },
    });

    return { sessaoId: sessao.id, refreshToken, expiraEm };
  }

  /**
   * Validação usada pelo guard a cada requisição autenticada.
   * Encerra a sessão quando ela passou do limite de inatividade ou de vida.
   */
  async validarAtividade(
    sessaoId: string,
    inatividadeMinutos: number,
  ): Promise<ResultadoValidacao> {
    const sessao = await this.prisma.sessao.findUnique({
      where: { id: sessaoId },
      select: {
        usuarioId: true,
        ultimaAtividadeEm: true,
        expiraEm: true,
        encerradaEm: true,
        motivoEncerramento: true,
        // O perfil vem do banco, nunca do token: mudança de permissão vale na hora.
        usuario: { select: { ativo: true, perfil: { select: { codigo: true } } } },
      },
    });

    if (!sessao) {
      return { valida: false, motivo: SessaoMotivo.LOGOUT };
    }
    if (sessao.encerradaEm) {
      return { valida: false, motivo: sessao.motivoEncerramento ?? SessaoMotivo.LOGOUT };
    }

    if (!sessao.usuario.ativo) {
      await this.encerrar(sessaoId, SessaoMotivo.USUARIO_DESATIVADO);
      return { valida: false, motivo: SessaoMotivo.USUARIO_DESATIVADO };
    }

    const agora = Date.now();

    if (sessao.expiraEm.getTime() <= agora) {
      await this.encerrar(sessaoId, SessaoMotivo.EXPIRACAO);
      return { valida: false, motivo: SessaoMotivo.EXPIRACAO };
    }

    const ocioso = agora - sessao.ultimaAtividadeEm.getTime();
    if (ocioso > inatividadeMinutos * MS_POR_MINUTO) {
      await this.encerrar(sessaoId, SessaoMotivo.INATIVIDADE);
      return { valida: false, motivo: SessaoMotivo.INATIVIDADE };
    }

    if (ocioso > SessaoService.JANELA_ATUALIZACAO_MS) {
      await this.prisma.sessao.update({
        where: { id: sessaoId },
        data: { ultimaAtividadeEm: new Date(agora) },
      });
    }

    return { valida: true, usuarioId: sessao.usuarioId, perfil: sessao.usuario.perfil.codigo };
  }

  /**
   * Rotação do refresh token. Devolve nulo quando o token não corresponde a
   * uma sessão viva — inclusive quando ela já foi encerrada.
   */
  async rotacionar(
    refreshToken: string,
    inatividadeMinutos: number,
  ): Promise<{ sessaoId: string; usuarioId: string; refreshToken: string } | null> {
    const sessao = await this.prisma.sessao.findUnique({
      where: { refreshTokenHash: SessaoService.hashDeToken(refreshToken) },
      select: {
        id: true,
        usuarioId: true,
        ultimaAtividadeEm: true,
        expiraEm: true,
        encerradaEm: true,
      },
    });

    if (!sessao || sessao.encerradaEm) {
      return null;
    }

    const agora = Date.now();
    if (sessao.expiraEm.getTime() <= agora) {
      await this.encerrar(sessao.id, SessaoMotivo.EXPIRACAO);
      return null;
    }
    if (agora - sessao.ultimaAtividadeEm.getTime() > inatividadeMinutos * MS_POR_MINUTO) {
      await this.encerrar(sessao.id, SessaoMotivo.INATIVIDADE);
      return null;
    }

    const novoToken = randomBytes(32).toString('base64url');
    await this.prisma.sessao.update({
      where: { id: sessao.id },
      data: {
        refreshTokenHash: SessaoService.hashDeToken(novoToken),
        ultimaAtividadeEm: new Date(agora),
      },
    });

    return { sessaoId: sessao.id, usuarioId: sessao.usuarioId, refreshToken: novoToken };
  }

  async encerrar(sessaoId: string, motivo: SessaoMotivo): Promise<void> {
    await this.prisma.sessao.updateMany({
      where: { id: sessaoId, encerradaEm: null },
      data: { encerradaEm: new Date(), motivoEncerramento: motivo },
    });
  }

  /** Usada quando o usuário é desativado, troca de perfil ou troca de senha. */
  async encerrarTodasDoUsuario(usuarioId: string, motivo: SessaoMotivo): Promise<number> {
    const resultado = await this.prisma.sessao.updateMany({
      where: { usuarioId, encerradaEm: null },
      data: { encerradaEm: new Date(), motivoEncerramento: motivo },
    });
    return resultado.count;
  }
}
