import { Injectable } from '@nestjs/common';
import { FormularioStatus, PerguntaTipo, Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

export interface FormularioResumo {
  id: string;
  titulo: string;
  descricao: string | null;
  status: FormularioStatus;
  versao: number;
  vigenciaInicio: Date | null;
  vigenciaFim: Date | null;
  publicadoEm: Date | null;
  encerradoEm: Date | null;
  criadoEm: Date;
  totalPerguntas: number;
}

export interface AlternativaRegistro {
  id: string;
  texto: string;
  ordem: number;
}

export interface PerguntaRegistro {
  id: string;
  enunciado: string;
  tipo: PerguntaTipo;
  obrigatoria: boolean;
  ordem: number;
  escalaMinimo: number | null;
  escalaMaximo: number | null;
  escalaRotuloMinimo: string | null;
  escalaRotuloMaximo: string | null;
  alternativas: AlternativaRegistro[];
}

export type FormularioCompleto = FormularioResumo & { perguntas: PerguntaRegistro[] };

/**
 * Deslocamento usado na primeira fase da reordenação. Precisa ser positivo:
 * o banco tem CHECK de ordem > 0.
 */
const DESLOCAMENTO_TEMPORARIO = 1_000_000;

/**
 * Acesso a dados de formulário, pergunta e alternativa.
 *
 * Nenhuma projeção devolve `criadoPorId` ou outro dado interno: a área
 * administrativa precisa do conteúdo do formulário, não da estrutura do banco.
 */
@Injectable()
export class FormulariosRepository {
  private static readonly SELECAO_RESUMO = {
    id: true,
    titulo: true,
    descricao: true,
    status: true,
    versao: true,
    vigenciaInicio: true,
    vigenciaFim: true,
    publicadoEm: true,
    encerradoEm: true,
    criadoEm: true,
    _count: { select: { perguntas: true } },
  } satisfies Prisma.FormularioSelect;

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
    alternativas: {
      select: { id: true, texto: true, ordem: true },
      orderBy: { ordem: 'asc' },
    },
  } satisfies Prisma.PerguntaSelect;

  constructor(private readonly prisma: PrismaService) {}

  private projetarResumo(
    bruto: Omit<FormularioResumo, 'totalPerguntas'> & { _count: { perguntas: number } },
  ): FormularioResumo {
    const { _count, ...resto } = bruto;
    return { ...resto, totalPerguntas: _count.perguntas };
  }

  // -------------------------------------------------------------------------
  // Formulário
  // -------------------------------------------------------------------------

  async listar(filtro: {
    status?: FormularioStatus;
    limite: number;
    deslocamento: number;
  }): Promise<{ itens: FormularioResumo[]; total: number }> {
    const where: Prisma.FormularioWhereInput = filtro.status ? { status: filtro.status } : {};

    const [brutos, total] = await this.prisma.$transaction([
      this.prisma.formulario.findMany({
        where,
        select: FormulariosRepository.SELECAO_RESUMO,
        orderBy: { criadoEm: 'desc' },
        take: filtro.limite,
        skip: filtro.deslocamento,
      }),
      this.prisma.formulario.count({ where }),
    ]);

    return { itens: brutos.map((bruto) => this.projetarResumo(bruto)), total };
  }

  /** Uma consulta traz formulário, perguntas e alternativas: nada de N+1. */
  async buscarCompleto(id: string): Promise<FormularioCompleto | null> {
    const bruto = await this.prisma.formulario.findUnique({
      where: { id },
      select: {
        ...FormulariosRepository.SELECAO_RESUMO,
        perguntas: {
          select: FormulariosRepository.SELECAO_PERGUNTA,
          orderBy: { ordem: 'asc' },
        },
      },
    });

    if (!bruto) {
      return null;
    }
    const { perguntas, ...resumo } = bruto;
    return { ...this.projetarResumo(resumo), perguntas };
  }

  /** Resumo sem as perguntas: usado depois de publicar ou encerrar. */
  async buscarResumo(id: string): Promise<FormularioResumo | null> {
    const bruto = await this.prisma.formulario.findUnique({
      where: { id },
      select: FormulariosRepository.SELECAO_RESUMO,
    });
    return bruto ? this.projetarResumo(bruto) : null;
  }

  async buscarSituacao(
    id: string,
  ): Promise<{ id: string; status: FormularioStatus; titulo: string } | null> {
    return this.prisma.formulario.findUnique({
      where: { id },
      select: { id: true, status: true, titulo: true },
    });
  }

  async criar(dados: {
    titulo: string;
    descricao?: string;
    vigenciaInicio?: Date;
    vigenciaFim?: Date;
    criadoPorId: string;
  }): Promise<FormularioResumo> {
    const bruto = await this.prisma.formulario.create({
      data: {
        titulo: dados.titulo,
        descricao: dados.descricao ?? null,
        vigenciaInicio: dados.vigenciaInicio ?? null,
        vigenciaFim: dados.vigenciaFim ?? null,
        criadoPor: { connect: { id: dados.criadoPorId } },
      },
      select: FormulariosRepository.SELECAO_RESUMO,
    });
    return this.projetarResumo(bruto);
  }

  async atualizar(
    id: string,
    dados: {
      titulo?: string;
      descricao?: string;
      vigenciaInicio?: Date;
      vigenciaFim?: Date;
    },
  ): Promise<FormularioResumo> {
    const bruto = await this.prisma.formulario.update({
      where: { id },
      data: {
        ...(dados.titulo === undefined ? {} : { titulo: dados.titulo }),
        ...(dados.descricao === undefined ? {} : { descricao: dados.descricao }),
        ...(dados.vigenciaInicio === undefined ? {} : { vigenciaInicio: dados.vigenciaInicio }),
        ...(dados.vigenciaFim === undefined ? {} : { vigenciaFim: dados.vigenciaFim }),
      },
      select: FormulariosRepository.SELECAO_RESUMO,
    });
    return this.projetarResumo(bruto);
  }

  /**
   * Troca de status com trava otimista no próprio WHERE: só muda se o
   * formulário ainda estiver no status de origem esperado.
   */
  async trocarStatus(
    id: string,
    de: FormularioStatus,
    para: FormularioStatus,
    momento: Date,
  ): Promise<number> {
    const resultado = await this.prisma.formulario.updateMany({
      where: { id, status: de },
      data: {
        status: para,
        ...(para === FormularioStatus.EM_COLETA ? { publicadoEm: momento } : {}),
        ...(para === FormularioStatus.ENCERRADO ? { encerradoEm: momento } : {}),
      },
    });
    return resultado.count;
  }

  /** Só rascunho é apagável, e apenas enquanto não existir resposta. */
  async excluirRascunho(id: string): Promise<number> {
    const resultado = await this.prisma.formulario.deleteMany({
      where: { id, status: FormularioStatus.RASCUNHO, respostas: { none: {} } },
    });
    return resultado.count;
  }

  async temResposta(formularioId: string): Promise<boolean> {
    const total = await this.prisma.resposta.count({ where: { formularioId } });
    return total > 0;
  }

  // -------------------------------------------------------------------------
  // Pergunta
  // -------------------------------------------------------------------------

  async buscarPergunta(formularioId: string, perguntaId: string): Promise<PerguntaRegistro | null> {
    // O formulário entra no WHERE: pergunta de outro formulário não é encontrada.
    return this.prisma.pergunta.findFirst({
      where: { id: perguntaId, formularioId },
      select: FormulariosRepository.SELECAO_PERGUNTA,
    });
  }

  async criarPergunta(
    formularioId: string,
    dados: {
      enunciado: string;
      tipo: PerguntaTipo;
      obrigatoria: boolean;
      escalaMinimo?: number | null;
      escalaMaximo?: number | null;
      escalaRotuloMinimo?: string | null;
      escalaRotuloMaximo?: string | null;
    },
  ): Promise<PerguntaRegistro> {
    return this.prisma.$transaction(async (tx) => {
      const agregado = await tx.pergunta.aggregate({
        where: { formularioId },
        _max: { ordem: true },
      });

      return tx.pergunta.create({
        data: {
          formularioId,
          enunciado: dados.enunciado,
          tipo: dados.tipo,
          obrigatoria: dados.obrigatoria,
          ordem: (agregado._max.ordem ?? 0) + 1,
          escalaMinimo: dados.escalaMinimo ?? null,
          escalaMaximo: dados.escalaMaximo ?? null,
          escalaRotuloMinimo: dados.escalaRotuloMinimo ?? null,
          escalaRotuloMaximo: dados.escalaRotuloMaximo ?? null,
        },
        select: FormulariosRepository.SELECAO_PERGUNTA,
      });
    });
  }

  async atualizarPergunta(
    perguntaId: string,
    dados: {
      enunciado?: string;
      obrigatoria?: boolean;
      escalaMinimo?: number;
      escalaMaximo?: number;
      escalaRotuloMinimo?: string;
      escalaRotuloMaximo?: string;
    },
  ): Promise<PerguntaRegistro> {
    return this.prisma.pergunta.update({
      where: { id: perguntaId },
      data: {
        ...(dados.enunciado === undefined ? {} : { enunciado: dados.enunciado }),
        ...(dados.obrigatoria === undefined ? {} : { obrigatoria: dados.obrigatoria }),
        ...(dados.escalaMinimo === undefined ? {} : { escalaMinimo: dados.escalaMinimo }),
        ...(dados.escalaMaximo === undefined ? {} : { escalaMaximo: dados.escalaMaximo }),
        ...(dados.escalaRotuloMinimo === undefined
          ? {}
          : { escalaRotuloMinimo: dados.escalaRotuloMinimo }),
        ...(dados.escalaRotuloMaximo === undefined
          ? {}
          : { escalaRotuloMaximo: dados.escalaRotuloMaximo }),
      },
      select: FormulariosRepository.SELECAO_PERGUNTA,
    });
  }

  /** Remove a pergunta e fecha o buraco na numeração, em uma transação. */
  async excluirPergunta(formularioId: string, perguntaId: string, ordem: number): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.pergunta.delete({ where: { id: perguntaId } }),
      this.prisma.pergunta.updateMany({
        where: { formularioId, ordem: { gt: ordem } },
        data: { ordem: { decrement: 1 } },
      }),
    ]);
  }

  async listarIdsDePerguntas(formularioId: string): Promise<string[]> {
    const perguntas = await this.prisma.pergunta.findMany({
      where: { formularioId },
      select: { id: true },
      orderBy: { ordem: 'asc' },
    });
    return perguntas.map((pergunta) => pergunta.id);
  }

  /**
   * Reordena em duas fases porque (formulario_id, ordem) é único: primeiro
   * desloca para uma faixa alta e livre, depois grava a ordem final.
   */
  async reordenarPerguntas(formularioId: string, idsNaOrdem: string[]): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      for (const [indice, id] of idsNaOrdem.entries()) {
        await tx.pergunta.update({
          where: { id },
          data: { ordem: DESLOCAMENTO_TEMPORARIO + indice + 1 },
        });
      }
      for (const [indice, id] of idsNaOrdem.entries()) {
        await tx.pergunta.update({ where: { id }, data: { ordem: indice + 1 } });
      }
      await tx.formulario.update({
        where: { id: formularioId },
        data: { atualizadoEm: new Date() },
      });
    });
  }

  // -------------------------------------------------------------------------
  // Alternativa
  // -------------------------------------------------------------------------

  async buscarAlternativa(
    perguntaId: string,
    alternativaId: string,
  ): Promise<AlternativaRegistro | null> {
    return this.prisma.alternativa.findFirst({
      where: { id: alternativaId, perguntaId },
      select: { id: true, texto: true, ordem: true },
    });
  }

  async criarAlternativa(perguntaId: string, texto: string): Promise<AlternativaRegistro> {
    return this.prisma.$transaction(async (tx) => {
      const agregado = await tx.alternativa.aggregate({
        where: { perguntaId },
        _max: { ordem: true },
      });

      return tx.alternativa.create({
        data: { perguntaId, texto, ordem: (agregado._max.ordem ?? 0) + 1 },
        select: { id: true, texto: true, ordem: true },
      });
    });
  }

  async atualizarAlternativa(alternativaId: string, texto: string): Promise<AlternativaRegistro> {
    return this.prisma.alternativa.update({
      where: { id: alternativaId },
      data: { texto },
      select: { id: true, texto: true, ordem: true },
    });
  }

  async excluirAlternativa(
    perguntaId: string,
    alternativaId: string,
    ordem: number,
  ): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.alternativa.delete({ where: { id: alternativaId } }),
      this.prisma.alternativa.updateMany({
        where: { perguntaId, ordem: { gt: ordem } },
        data: { ordem: { decrement: 1 } },
      }),
    ]);
  }

  async listarIdsDeAlternativas(perguntaId: string): Promise<string[]> {
    const alternativas = await this.prisma.alternativa.findMany({
      where: { perguntaId },
      select: { id: true },
      orderBy: { ordem: 'asc' },
    });
    return alternativas.map((alternativa) => alternativa.id);
  }

  async reordenarAlternativas(perguntaId: string, idsNaOrdem: string[]): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      for (const [indice, id] of idsNaOrdem.entries()) {
        await tx.alternativa.update({
          where: { id },
          data: { ordem: DESLOCAMENTO_TEMPORARIO + indice + 1 },
        });
      }
      for (const [indice, id] of idsNaOrdem.entries()) {
        await tx.alternativa.update({ where: { id }, data: { ordem: indice + 1 } });
      }
      await tx.pergunta.update({ where: { id: perguntaId }, data: { atualizadoEm: new Date() } });
    });
  }
}
