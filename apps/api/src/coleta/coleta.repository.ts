import { Injectable } from '@nestjs/common';
import {
  FormularioStatus,
  Prisma,
  RespostaMarcacao,
  RespostaOrigem,
  RespostaStatus,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

export interface AlternativaDoFormulario {
  id: string;
  texto: string;
  ordem: number;
}

export interface PerguntaDoFormulario {
  id: string;
  enunciado: string;
  tipo: Prisma.PerguntaGetPayload<{ select: { tipo: true } }>['tipo'];
  obrigatoria: boolean;
  ordem: number;
  escalaMinimo: number | null;
  escalaMaximo: number | null;
  escalaRotuloMinimo: string | null;
  escalaRotuloMaximo: string | null;
  condicaoAlternativaId: string | null;
  condicaoPerguntaId: string | null;
  alternativas: AlternativaDoFormulario[];
}

export interface FormularioEmColeta {
  id: string;
  titulo: string;
  descricao: string | null;
  status: FormularioStatus;
  vigenciaInicio: Date | null;
  vigenciaFim: Date | null;
  perguntas: PerguntaDoFormulario[];
}

export interface RespostaGravada {
  id: string;
  status: RespostaStatus;
  origem: RespostaOrigem;
  recebidoEm: Date;
}

export interface ItemParaGravar {
  perguntaId: string;
  alternativaId: string | null;
  valorTexto: string | null;
  valorNumero: number | null;
}

/**
 * Acesso a dados da coleta pública.
 *
 * A busca é sempre pelo token público — o uuid do formulário nunca entra por
 * aqui. Nenhuma projeção devolve dado administrativo.
 */
@Injectable()
export class ColetaRepository {
  private static readonly SELECAO_PERGUNTA = {
    id: true,
    enunciado: true,
    tipo: true,
    obrigatoria: true,
    ordem: true,
    escalaMinimo: true,
    escalaMaximo: true,
    escalaRotuloMinimo: true,
    escalaRotuloMaximo: true,
    condicaoAlternativaId: true,
    condicaoAlternativa: { select: { perguntaId: true } },
    alternativas: {
      select: { id: true, texto: true, ordem: true },
      orderBy: { ordem: 'asc' },
    },
  } satisfies Prisma.PerguntaSelect;

  constructor(private readonly prisma: PrismaService) {}

  /** Uma consulta traz formulário, perguntas e alternativas. */
  async buscarPorToken(token: string): Promise<FormularioEmColeta | null> {
    const bruto = await this.prisma.formulario.findUnique({
      where: { tokenPublico: token },
      select: {
        id: true,
        titulo: true,
        descricao: true,
        status: true,
        vigenciaInicio: true,
        vigenciaFim: true,
        perguntas: {
          select: ColetaRepository.SELECAO_PERGUNTA,
          orderBy: { ordem: 'asc' },
        },
      },
    });

    if (!bruto) {
      return null;
    }

    return {
      ...bruto,
      perguntas: bruto.perguntas.map(({ condicaoAlternativa, ...pergunta }) => ({
        ...pergunta,
        condicaoPerguntaId: condicaoAlternativa?.perguntaId ?? null,
      })),
    };
  }

  async municipioExiste(codigoIbge: number): Promise<{ codigoIbge: number; uf: string } | null> {
    return this.prisma.municipio.findUnique({
      where: { codigoIbge },
      select: { codigoIbge: true, uf: true },
    });
  }

  /** Devolve a resposta já registrada com este id, se houver. Base da idempotência. */
  async buscarResposta(id: string): Promise<RespostaGravada | null> {
    return this.prisma.resposta.findUnique({
      where: { id },
      select: { id: true, status: true, origem: true, recebidoEm: true },
    });
  }

  /**
   * Grava resposta e itens em uma transação. O hash do dispositivo chega pronto:
   * o valor em claro não passa por esta camada.
   */
  async gravar(dados: {
    id: string;
    formularioId: string;
    municipioCodigoIbge: number;
    status: RespostaStatus;
    origem: RespostaOrigem;
    dispositivoHash: string;
    consentimentoEm: Date;
    iniciadoEm: Date;
    coletadoEm: Date;
    duracaoSegundos: number;
    marcacoes: RespostaMarcacao[];
    latitude: number | null;
    longitude: number | null;
    motivoConferencia: string | null;
    itens: ItemParaGravar[];
  }): Promise<RespostaGravada> {
    return this.prisma.$transaction(async (tx) => {
      const resposta = await tx.resposta.create({
        data: {
          id: dados.id,
          formularioId: dados.formularioId,
          municipioCodigoIbge: dados.municipioCodigoIbge,
          status: dados.status,
          origem: dados.origem,
          dispositivoHash: dados.dispositivoHash,
          consentimentoEm: dados.consentimentoEm,
          iniciadoEm: dados.iniciadoEm,
          coletadoEm: dados.coletadoEm,
          duracaoSegundos: dados.duracaoSegundos,
          marcacoes: dados.marcacoes,
          latitude: dados.latitude,
          longitude: dados.longitude,
          motivoConferencia: dados.motivoConferencia,
        },
        select: { id: true, status: true, origem: true, recebidoEm: true },
      });

      await tx.respostaItem.createMany({
        data: dados.itens.map((item) => ({ ...item, respostaId: resposta.id })),
      });

      return resposta;
    });
  }
}
