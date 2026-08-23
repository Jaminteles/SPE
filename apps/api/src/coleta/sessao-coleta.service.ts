import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac, randomBytes } from 'node:crypto';

import { PrismaService } from '../prisma/prisma.service';

export interface SessaoAberta {
  token: string;
  iniciadaEm: Date;
  expiraEm: Date;
}

export interface SessaoValidada {
  id: string;
  formularioId: string;
  iniciadaEm: Date;
  origemHash: string | null;
}

const MS_POR_MINUTO = 60_000;

/**
 * Sessão de preenchimento.
 *
 * Serve a três coisas ao mesmo tempo:
 * 1. marca o **início real** do preenchimento, medido pelo servidor — o aparelho
 *    não é fonte confiável de tempo;
 * 2. é de **uso único**: o mesmo token não grava duas respostas, o que fecha o
 *    replay de um pacote capturado;
 * 3. guarda o **hash da origem**, usado só para detectar volume anômalo.
 *
 * Tudo aqui é dado técnico de duplicidade: expurgado no encerramento da coleta.
 * O token em claro só existe no cliente; o banco guarda SHA-256.
 */
@Injectable()
export class SessaoColetaService {
  private static readonly DURACAO_PADRAO_MIN = 120;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  static hashDeToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /** HMAC do endereço de rede. Nunca guardamos o endereço em claro. */
  hashDeOrigem(ip: string | undefined): string | null {
    if (!ip) {
      return null;
    }
    const pepper = this.config.getOrThrow<string>('DEVICE_HASH_PEPPER');
    return createHmac('sha256', pepper).update(ip).digest('hex');
  }

  async abrir(formularioId: string, ip: string | undefined): Promise<SessaoAberta> {
    const token = randomBytes(24).toString('base64url');
    const duracao = this.config.get<number>(
      'COLETA_SESSAO_MINUTOS',
      SessaoColetaService.DURACAO_PADRAO_MIN,
    );
    const expiraEm = new Date(Date.now() + duracao * MS_POR_MINUTO);

    const sessao = await this.prisma.sessaoColeta.create({
      data: {
        formularioId,
        tokenHash: SessaoColetaService.hashDeToken(token),
        origemHash: this.hashDeOrigem(ip),
        expiraEm,
      },
      select: { iniciadaEm: true, expiraEm: true },
    });

    return { token, iniciadaEm: sessao.iniciadaEm, expiraEm: sessao.expiraEm };
  }

  /**
   * Consome a sessão. Devolve nulo quando o token é desconhecido, já foi usado,
   * expirou ou pertence a outro formulário — sem distinguir os casos.
   *
   * O consumo é atômico (`updateMany` com `usadaEm: null` no WHERE): dois envios
   * simultâneos com o mesmo token, só um passa.
   */
  async consumir(token: string, formularioId: string): Promise<SessaoValidada | null> {
    const sessao = await this.prisma.sessaoColeta.findUnique({
      where: { tokenHash: SessaoColetaService.hashDeToken(token) },
      select: {
        id: true,
        formularioId: true,
        iniciadaEm: true,
        expiraEm: true,
        usadaEm: true,
        origemHash: true,
      },
    });

    if (
      !sessao ||
      sessao.usadaEm ||
      sessao.formularioId !== formularioId ||
      sessao.expiraEm.getTime() <= Date.now()
    ) {
      return null;
    }

    const consumida = await this.prisma.sessaoColeta.updateMany({
      where: { id: sessao.id, usadaEm: null },
      data: { usadaEm: new Date() },
    });
    if (consumida.count === 0) {
      return null;
    }

    return {
      id: sessao.id,
      formularioId: sessao.formularioId,
      iniciadaEm: sessao.iniciadaEm,
      origemHash: sessao.origemHash,
    };
  }

  /** Quantas sessões a mesma origem consumiu na janela. Base do volume anômalo. */
  async contarUsosDaOrigem(
    origemHash: string | null,
    formularioId: string,
    janelaMinutos: number,
  ): Promise<number> {
    if (!origemHash) {
      return 0;
    }
    const desde = new Date(Date.now() - janelaMinutos * MS_POR_MINUTO);
    return this.prisma.sessaoColeta.count({
      where: { origemHash, formularioId, usadaEm: { gte: desde } },
    });
  }
}
