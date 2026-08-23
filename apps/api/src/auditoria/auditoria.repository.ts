import { Injectable } from '@nestjs/common';
import { AuditoriaAcao, Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

export interface FiltroAuditoria {
  acao?: AuditoriaAcao;
  usuarioId?: string;
  de?: Date;
  ate?: Date;
  limite: number;
  deslocamento: number;
}

export interface LogRegistro {
  id: string;
  acao: AuditoriaAcao;
  entidade: string;
  entidadeId: string | null;
  detalhe: Prisma.JsonValue | null;
  criadoEm: Date;
  usuario: { id: string; nome: string; email: string } | null;
}

@Injectable()
export class AuditoriaRepository {
  private static readonly SELECAO = {
    id: true,
    acao: true,
    entidade: true,
    entidadeId: true,
    detalhe: true,
    criadoEm: true,
    usuario: { select: { id: true, nome: true, email: true } },
  } satisfies Prisma.LogAuditoriaSelect;

  constructor(private readonly prisma: PrismaService) {}

  async listar(filtro: FiltroAuditoria): Promise<{ itens: LogRegistro[]; total: number }> {
    const where: Prisma.LogAuditoriaWhereInput = {
      ...(filtro.acao ? { acao: filtro.acao } : {}),
      ...(filtro.usuarioId ? { usuarioId: filtro.usuarioId } : {}),
      ...(filtro.de || filtro.ate
        ? {
            criadoEm: {
              ...(filtro.de ? { gte: filtro.de } : {}),
              ...(filtro.ate ? { lte: filtro.ate } : {}),
            },
          }
        : {}),
    };

    // Uma consulta traz o usuário junto: nada de N+1 para preencher o autor.
    const [itens, total] = await this.prisma.$transaction([
      this.prisma.logAuditoria.findMany({
        where,
        select: AuditoriaRepository.SELECAO,
        orderBy: { criadoEm: 'desc' },
        take: filtro.limite,
        skip: filtro.deslocamento,
      }),
      this.prisma.logAuditoria.count({ where }),
    ]);

    return { itens, total };
  }
}
