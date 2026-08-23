import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

export interface FiltroMunicipio {
  nome?: string;
  limite: number;
  deslocamento: number;
}

export interface MunicipioRegistro {
  codigoIbge: number;
  nome: string;
  uf: string;
}

/**
 * Acesso a dados de município. A consulta é sempre restrita à Bahia
 * e devolve apenas as colunas públicas (nunca o id interno).
 */
@Injectable()
export class MunicipiosRepository {
  private static readonly UF = 'BA';

  private static readonly SELECAO = {
    codigoIbge: true,
    nome: true,
    uf: true,
  } satisfies Prisma.MunicipioSelect;

  constructor(private readonly prisma: PrismaService) {}

  private montarFiltro(filtro: FiltroMunicipio): Prisma.MunicipioWhereInput {
    return {
      uf: MunicipiosRepository.UF,
      ...(filtro.nome
        ? { nome: { contains: filtro.nome, mode: Prisma.QueryMode.insensitive } }
        : {}),
    };
  }

  async listar(filtro: FiltroMunicipio): Promise<{ itens: MunicipioRegistro[]; total: number }> {
    const where = this.montarFiltro(filtro);

    const [itens, total] = await this.prisma.$transaction([
      this.prisma.municipio.findMany({
        where,
        select: MunicipiosRepository.SELECAO,
        orderBy: { nome: 'asc' },
        take: filtro.limite,
        skip: filtro.deslocamento,
      }),
      this.prisma.municipio.count({ where }),
    ]);

    return { itens, total };
  }

  async buscarPorCodigoIbge(codigoIbge: number): Promise<MunicipioRegistro | null> {
    return this.prisma.municipio.findUnique({
      where: { codigoIbge },
      select: MunicipiosRepository.SELECAO,
    });
  }
}
