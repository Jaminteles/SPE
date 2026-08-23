import { Injectable, Logger } from '@nestjs/common';
import { AuditoriaAcao, Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

export interface RegistroAuditoria {
  acao: AuditoriaAcao;
  entidade: string;
  entidadeId?: string | null;
  usuarioId?: string | null;
  detalhe?: Record<string, string | number | boolean | null>;
}

/**
 * Trilha de auditoria.
 *
 * O que nunca entra aqui: token, refresh token, senha, hash de senha,
 * hash de dispositivo, geolocalização — nada que permita reidentificar
 * um respondente ou reutilizar uma credencial.
 *
 * Falha ao auditar não derruba a operação de negócio, mas fica registrada
 * como erro para investigação.
 */
@Injectable()
export class AuditoriaService {
  private readonly logger = new Logger(AuditoriaService.name);

  /** Chaves proibidas em `detalhe`, independentemente de quem chamou. */
  private static readonly CAMPOS_PROIBIDOS = [
    'senha',
    'senhahash',
    'senha_hash',
    'token',
    'accesstoken',
    'access_token',
    'refreshtoken',
    'refresh_token',
    'authorization',
    'dispositivohash',
    'dispositivo_hash',
    'latitude',
    'longitude',
  ];

  constructor(private readonly prisma: PrismaService) {}

  async registrar(registro: RegistroAuditoria): Promise<void> {
    try {
      await this.prisma.logAuditoria.create({
        data: {
          acao: registro.acao,
          entidade: registro.entidade,
          entidadeId: registro.entidadeId ?? null,
          usuarioId: registro.usuarioId ?? null,
          detalhe: this.higienizar(registro.detalhe),
        },
      });
    } catch (erro) {
      this.logger.error(
        `Falha ao registrar auditoria da ação ${registro.acao}.`,
        erro instanceof Error ? erro.stack : undefined,
      );
    }
  }

  private higienizar(
    detalhe: RegistroAuditoria['detalhe'],
  ): Prisma.InputJsonValue | typeof Prisma.JsonNull {
    if (!detalhe) {
      return Prisma.JsonNull;
    }

    const limpo: Record<string, string | number | boolean | null> = {};
    for (const [chave, valor] of Object.entries(detalhe)) {
      if (AuditoriaService.CAMPOS_PROIBIDOS.includes(chave.toLowerCase())) {
        this.logger.warn(`Campo "${chave}" descartado do detalhe de auditoria.`);
        continue;
      }
      limpo[chave] = valor;
    }
    return limpo;
  }
}
