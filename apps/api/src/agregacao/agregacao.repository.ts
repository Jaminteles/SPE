import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

/** Views materializadas de resultado. A lista é fechada, escrita à mão. */
const VIEWS = ['mv_resumo_formulario', 'mv_resultado_pergunta', 'mv_resultado_municipio'] as const;

export type ViewDeResultado = (typeof VIEWS)[number];

export interface ResumoAgregado {
  formularioId: string;
  respostasValidas: number;
  respostasEmConferencia: number;
  respostasInvalidadas: number;
  municipiosAlcancados: number;
}

/**
 * Acesso às agregações pré-calculadas.
 *
 * O painel lê daqui: nenhum endpoint de resultado varre `resposta` em tempo real.
 * A atualização é sempre `CONCURRENTLY` — a leitura não trava durante o refresh —
 * e cada view tem índice único para isso funcionar.
 */
@Injectable()
export class AgregacaoRepository {
  private readonly logger = new Logger(AgregacaoRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Atualiza uma view. O nome vem da lista fechada acima e é validado antes de
   * entrar no SQL — nunca de entrada do usuário.
   */
  async atualizar(view: ViewDeResultado): Promise<void> {
    if (!VIEWS.includes(view)) {
      throw new Error(`View de resultado desconhecida: ${view}`);
    }

    try {
      await this.prisma.$executeRawUnsafe(`REFRESH MATERIALIZED VIEW CONCURRENTLY "${view}"`);
    } catch (erro) {
      // A primeira atualização de uma view nunca populada não aceita CONCURRENTLY.
      if (this.ehViewNuncaPopulada(erro)) {
        this.logger.warn(`Primeira carga de ${view}: atualizando sem CONCURRENTLY.`);
        await this.prisma.$executeRawUnsafe(`REFRESH MATERIALIZED VIEW "${view}"`);
        return;
      }
      throw erro;
    }
  }

  async atualizarTodas(): Promise<ViewDeResultado[]> {
    for (const view of VIEWS) {
      await this.atualizar(view);
    }
    return [...VIEWS];
  }

  async buscarResumo(formularioId: string): Promise<ResumoAgregado | null> {
    const linhas = await this.prisma.$queryRaw<
      {
        formulario_id: string;
        respostas_validas: bigint;
        respostas_em_conferencia: bigint;
        respostas_invalidadas: bigint;
        municipios_alcancados: bigint;
      }[]
    >(
      // Parametrizado: o id nunca é concatenado no SQL.
      Prisma.sql`
        SELECT formulario_id, respostas_validas, respostas_em_conferencia,
               respostas_invalidadas, municipios_alcancados
          FROM "mv_resumo_formulario"
         WHERE formulario_id = ${formularioId}::uuid
      `,
    );

    const linha = linhas[0];
    if (!linha) {
      return null;
    }

    return {
      formularioId: linha.formulario_id,
      respostasValidas: Number(linha.respostas_validas),
      respostasEmConferencia: Number(linha.respostas_em_conferencia),
      respostasInvalidadas: Number(linha.respostas_invalidadas),
      municipiosAlcancados: Number(linha.municipios_alcancados),
    };
  }

  private ehViewNuncaPopulada(erro: unknown): boolean {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    return mensagem.includes('has not been populated');
  }
}
