import { Injectable } from '@nestjs/common';
import { Prisma, RespostaMarcacao, RespostaOrigem, RespostaStatus } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

export interface RespostaParaConferencia {
  id: string;
  status: RespostaStatus;
  origem: RespostaOrigem;
  municipioCodigoIbge: number;
  municipioNome: string;
  iniciadoEm: Date;
  coletadoEm: Date;
  recebidoEm: Date;
  duracaoSegundos: number;
  marcacoes: RespostaMarcacao[];
  motivoConferencia: string | null;
  motivoInvalidacao: string | null;
  invalidadaEm: Date | null;
  temGeolocalizacao: boolean;
  latitude: number | null;
  longitude: number | null;
}

export interface FiltroDeConferencia {
  formularioId: string;
  status?: RespostaStatus;
  marcacao?: RespostaMarcacao;
  municipioCodigoIbge?: number;
  limite: number;
  deslocamento: number;
}

/**
 * Acesso a dados de resposta para conferência.
 *
 * A projeção **nunca** inclui `dispositivoHash` nem os itens respondidos: quem
 * confere integridade não precisa — e não deve — ver o conteúdo da resposta.
 */
@Injectable()
export class RespostasRepository {
  private static readonly SELECAO = {
    id: true,
    status: true,
    origem: true,
    municipioCodigoIbge: true,
    iniciadoEm: true,
    coletadoEm: true,
    recebidoEm: true,
    duracaoSegundos: true,
    marcacoes: true,
    motivoConferencia: true,
    motivoInvalidacao: true,
    invalidadaEm: true,
    latitude: true,
    longitude: true,
    municipio: { select: { nome: true } },
  } satisfies Prisma.RespostaSelect;

  constructor(private readonly prisma: PrismaService) {}

  private projetar(
    bruto: Prisma.RespostaGetPayload<{ select: typeof RespostasRepository.SELECAO }>,
  ): RespostaParaConferencia {
    const { municipio, latitude, longitude, ...resto } = bruto;
    return {
      ...resto,
      municipioNome: municipio.nome,
      temGeolocalizacao: latitude !== null && longitude !== null,
      latitude: latitude === null ? null : Number(latitude),
      longitude: longitude === null ? null : Number(longitude),
    };
  }

  async listar(
    filtro: FiltroDeConferencia,
  ): Promise<{ itens: RespostaParaConferencia[]; total: number }> {
    const where: Prisma.RespostaWhereInput = {
      formularioId: filtro.formularioId,
      ...(filtro.status ? { status: filtro.status } : {}),
      ...(filtro.marcacao ? { marcacoes: { has: filtro.marcacao } } : {}),
      ...(filtro.municipioCodigoIbge ? { municipioCodigoIbge: filtro.municipioCodigoIbge } : {}),
    };

    const [brutos, total] = await this.prisma.$transaction([
      this.prisma.resposta.findMany({
        where,
        select: RespostasRepository.SELECAO,
        orderBy: { recebidoEm: 'desc' },
        take: filtro.limite,
        skip: filtro.deslocamento,
      }),
      this.prisma.resposta.count({ where }),
    ]);

    return { itens: brutos.map((bruto) => this.projetar(bruto)), total };
  }

  async buscar(formularioId: string, id: string): Promise<RespostaParaConferencia | null> {
    // O formulário entra no WHERE: resposta de outra pesquisa não é encontrada.
    const bruto = await this.prisma.resposta.findFirst({
      where: { id, formularioId },
      select: RespostasRepository.SELECAO,
    });
    return bruto ? this.projetar(bruto) : null;
  }

  /**
   * Invalidação: muda status, guarda quem, quando e por quê.
   * A linha permanece no banco — nunca há exclusão física de resposta.
   */
  async invalidar(id: string, autorId: string, motivo: string): Promise<number> {
    const resultado = await this.prisma.resposta.updateMany({
      where: { id, status: { not: RespostaStatus.INVALIDADA } },
      data: {
        status: RespostaStatus.INVALIDADA,
        invalidadaEm: new Date(),
        invalidadaPorId: autorId,
        motivoInvalidacao: motivo,
      },
    });
    return resultado.count;
  }

  /** Devolve a resposta para a contagem, limpando o registro da invalidação. */
  async revalidar(id: string, motivo: string): Promise<number> {
    const resultado = await this.prisma.resposta.updateMany({
      where: { id, status: RespostaStatus.INVALIDADA },
      data: {
        status: RespostaStatus.VALIDA,
        invalidadaEm: null,
        invalidadaPorId: null,
        motivoInvalidacao: null,
        motivoConferencia: motivo,
      },
    });
    return resultado.count;
  }

  async resumo(formularioId: string): Promise<{
    validas: number;
    emConferencia: number;
    invalidadas: number;
    porMarcacao: Record<string, number>;
  }> {
    const [validas, emConferencia, invalidadas, marcadas] = await this.prisma.$transaction([
      this.prisma.resposta.count({ where: { formularioId, status: RespostaStatus.VALIDA } }),
      this.prisma.resposta.count({
        where: { formularioId, status: RespostaStatus.EM_CONFERENCIA },
      }),
      this.prisma.resposta.count({ where: { formularioId, status: RespostaStatus.INVALIDADA } }),
      this.prisma.resposta.findMany({
        where: { formularioId, marcacoes: { isEmpty: false } },
        select: { marcacoes: true },
      }),
    ]);

    const porMarcacao: Record<string, number> = {};
    for (const resposta of marcadas) {
      for (const marcacao of resposta.marcacoes) {
        porMarcacao[marcacao] = (porMarcacao[marcacao] ?? 0) + 1;
      }
    }

    return { validas, emConferencia, invalidadas, porMarcacao };
  }
}
