import { Injectable } from '@nestjs/common';
import { FormularioStatus } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

export interface PesquisaParaExpurgoTecnico {
  id: string;
  titulo: string;
  encerradoEm: Date;
}

export interface ResultadoDoExpurgoTecnico {
  respostas: number;
  sessoes: number;
}

/**
 * Acesso do expurgo.
 *
 * Tudo em lote e parametrizado. Nada aqui recebe id de usuário: expurgo é
 * rotina automática, não ação de tela.
 */
@Injectable()
export class ExpurgoRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Pesquisas encerradas que ainda não passaram pelo expurgo técnico. */
  async pesquisasComExpurgoTecnicoPendente(limite: number): Promise<PesquisaParaExpurgoTecnico[]> {
    const linhas = await this.prisma.formulario.findMany({
      where: {
        status: FormularioStatus.ENCERRADO,
        encerradoEm: { not: null },
        expurgoTecnicoEm: null,
      },
      select: { id: true, titulo: true, encerradoEm: true },
      orderBy: { encerradoEm: 'asc' },
      take: limite,
    });

    return linhas
      .filter((linha): linha is PesquisaParaExpurgoTecnico => linha.encerradoEm !== null)
      .map((linha) => ({ id: linha.id, titulo: linha.titulo, encerradoEm: linha.encerradoEm }));
  }

  /** Uma pesquisa específica, se ainda estiver pendente de expurgo técnico. */
  async pesquisaComExpurgoTecnicoPendente(
    formularioId: string,
  ): Promise<PesquisaParaExpurgoTecnico | null> {
    const linha = await this.prisma.formulario.findFirst({
      where: {
        id: formularioId,
        status: FormularioStatus.ENCERRADO,
        encerradoEm: { not: null },
        expurgoTecnicoEm: null,
      },
      select: { id: true, titulo: true, encerradoEm: true },
    });

    return linha && linha.encerradoEm
      ? { id: linha.id, titulo: linha.titulo, encerradoEm: linha.encerradoEm }
      : null;
  }

  /**
   * Expurgo técnico de uma pesquisa, em transação:
   *
   * - o hash do dispositivo vira NULL — encerrada a coleta, o controle de
   *   duplicidade perdeu finalidade e o dado só acrescentaria risco;
   * - as sessões de coleta (que guardam hash de token e de origem) são
   *   apagadas;
   * - a resposta em si permanece: o que sai é o dado técnico, não a apuração.
   *
   * A trava `expurgoTecnicoEm: null` no update do formulário faz a operação ser
   * idempotente: duas execuções simultâneas, só uma escreve.
   */
  async expurgarDadosTecnicos(
    formularioId: string,
    prazoDeRespostas: Date,
  ): Promise<ResultadoDoExpurgoTecnico | null> {
    return this.prisma.$transaction(async (tx) => {
      const marcado = await tx.formulario.updateMany({
        where: { id: formularioId, expurgoTecnicoEm: null, encerradoEm: { not: null } },
        data: { expurgoTecnicoEm: new Date() },
      });

      if (marcado.count === 0) {
        return null;
      }

      const respostas = await tx.resposta.updateMany({
        where: { formularioId, dispositivoHash: { not: null } },
        data: { dispositivoHash: null, expurgarApos: prazoDeRespostas },
      });

      // Respostas que já tinham sido anonimizadas ainda precisam do prazo.
      await tx.resposta.updateMany({
        where: { formularioId, expurgarApos: null },
        data: { expurgarApos: prazoDeRespostas },
      });

      const sessoes = await tx.sessaoColeta.deleteMany({ where: { formularioId } });

      return { respostas: respostas.count, sessoes: sessoes.count };
    });
  }

  /**
   * Apaga um lote de respostas vencidas. `resposta_item` sai em cascata, pelo
   * `onDelete: Cascade` do schema.
   *
   * O lote existe para o expurgo não tomar a tabela num único DELETE gigante.
   */
  async apagarRespostasVencidas(
    referencia: Date,
    lote: number,
  ): Promise<{ apagadas: number; pesquisas: string[] }> {
    const vencidas = await this.prisma.resposta.findMany({
      where: { expurgarApos: { not: null, lte: referencia } },
      select: { id: true, formularioId: true },
      orderBy: { expurgarApos: 'asc' },
      take: lote,
    });

    if (vencidas.length === 0) {
      return { apagadas: 0, pesquisas: [] };
    }

    const apagadas = await this.prisma.resposta.deleteMany({
      where: { id: { in: vencidas.map((resposta) => resposta.id) } },
    });

    return {
      apagadas: apagadas.count,
      pesquisas: [...new Set(vencidas.map((resposta) => resposta.formularioId))],
    };
  }

  /** Quanto ainda está pendente, para a rota de situação e para o log. */
  async situacao(referencia: Date): Promise<{
    respostasVencidas: number;
    respostasComPrazo: number;
    pesquisasComExpurgoTecnicoPendente: number;
    dispositivosAindaGuardados: number;
  }> {
    const [vencidas, comPrazo, pendentes, dispositivos] = await this.prisma.$transaction([
      this.prisma.resposta.count({ where: { expurgarApos: { not: null, lte: referencia } } }),
      this.prisma.resposta.count({ where: { expurgarApos: { not: null } } }),
      this.prisma.formulario.count({
        where: {
          status: FormularioStatus.ENCERRADO,
          encerradoEm: { not: null },
          expurgoTecnicoEm: null,
        },
      }),
      this.prisma.resposta.count({ where: { dispositivoHash: { not: null } } }),
    ]);

    return {
      respostasVencidas: vencidas,
      respostasComPrazo: comPrazo,
      pesquisasComExpurgoTecnicoPendente: pendentes,
      dispositivosAindaGuardados: dispositivos,
    };
  }

  /** Prazo de retenção de resposta: encerramento + N anos, em UTC. */
  static prazoDeRetencao(encerradoEm: Date, anos: number): Date {
    const prazo = new Date(encerradoEm);
    prazo.setUTCFullYear(prazo.getUTCFullYear() + anos);
    return prazo;
  }
}
