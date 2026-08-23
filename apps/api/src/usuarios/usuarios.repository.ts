import { Injectable } from '@nestjs/common';
import { PerfilCodigo, Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

/** Projeção pública do usuário. Nunca inclui `senhaHash`. */
export interface UsuarioRegistro {
  id: string;
  nome: string;
  email: string;
  ativo: boolean;
  perfil: PerfilCodigo;
  ultimoLoginEm: Date | null;
  criadoEm: Date;
}

/** Uso exclusivo do fluxo de autenticação. */
export interface CredencialUsuario {
  id: string;
  senhaHash: string;
  ativo: boolean;
  perfil: PerfilCodigo;
}

interface UsuarioBruto {
  id: string;
  nome: string;
  email: string;
  ativo: boolean;
  ultimoLoginEm: Date | null;
  criadoEm: Date;
  perfil: { codigo: PerfilCodigo };
}

@Injectable()
export class UsuariosRepository {
  private static readonly SELECAO = {
    id: true,
    nome: true,
    email: true,
    ativo: true,
    ultimoLoginEm: true,
    criadoEm: true,
    perfil: { select: { codigo: true } },
  } satisfies Prisma.UsuarioSelect;

  constructor(private readonly prisma: PrismaService) {}

  private projetar(bruto: UsuarioBruto): UsuarioRegistro {
    const { perfil, ...resto } = bruto;
    return { ...resto, perfil: perfil.codigo };
  }

  /** Normaliza o e-mail para evitar duplicidade por caixa ou espaço. */
  static normalizarEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  async listar(filtro: {
    ativo?: boolean;
    perfil?: PerfilCodigo;
    limite: number;
    deslocamento: number;
  }): Promise<{ itens: UsuarioRegistro[]; total: number }> {
    const where: Prisma.UsuarioWhereInput = {
      ...(filtro.ativo === undefined ? {} : { ativo: filtro.ativo }),
      ...(filtro.perfil ? { perfil: { codigo: filtro.perfil } } : {}),
    };

    const [brutos, total] = await this.prisma.$transaction([
      this.prisma.usuario.findMany({
        where,
        select: UsuariosRepository.SELECAO,
        orderBy: { nome: 'asc' },
        take: filtro.limite,
        skip: filtro.deslocamento,
      }),
      this.prisma.usuario.count({ where }),
    ]);

    return { itens: brutos.map((bruto) => this.projetar(bruto)), total };
  }

  async buscarPorId(id: string): Promise<UsuarioRegistro | null> {
    const bruto = await this.prisma.usuario.findUnique({
      where: { id },
      select: UsuariosRepository.SELECAO,
    });
    return bruto ? this.projetar(bruto) : null;
  }

  async buscarCredencialPorEmail(email: string): Promise<CredencialUsuario | null> {
    const bruto = await this.prisma.usuario.findUnique({
      where: { email: UsuariosRepository.normalizarEmail(email) },
      select: { id: true, senhaHash: true, ativo: true, perfil: { select: { codigo: true } } },
    });
    if (!bruto) {
      return null;
    }
    return {
      id: bruto.id,
      senhaHash: bruto.senhaHash,
      ativo: bruto.ativo,
      perfil: bruto.perfil.codigo,
    };
  }

  async buscarCredencialPorId(id: string): Promise<CredencialUsuario | null> {
    const bruto = await this.prisma.usuario.findUnique({
      where: { id },
      select: { id: true, senhaHash: true, ativo: true, perfil: { select: { codigo: true } } },
    });
    if (!bruto) {
      return null;
    }
    return {
      id: bruto.id,
      senhaHash: bruto.senhaHash,
      ativo: bruto.ativo,
      perfil: bruto.perfil.codigo,
    };
  }

  async criar(dados: {
    nome: string;
    email: string;
    senhaHash: string;
    perfil: PerfilCodigo;
  }): Promise<UsuarioRegistro> {
    const bruto = await this.prisma.usuario.create({
      data: {
        nome: dados.nome,
        email: UsuariosRepository.normalizarEmail(dados.email),
        senhaHash: dados.senhaHash,
        perfil: { connect: { codigo: dados.perfil } },
      },
      select: UsuariosRepository.SELECAO,
    });
    return this.projetar(bruto);
  }

  /**
   * Atualização com lista fechada de campos: nada de repassar o body do
   * request direto para o Prisma.
   */
  async atualizar(
    id: string,
    dados: { nome?: string; ativo?: boolean; perfil?: PerfilCodigo; senhaHash?: string },
  ): Promise<UsuarioRegistro> {
    const bruto = await this.prisma.usuario.update({
      where: { id },
      data: {
        ...(dados.nome === undefined ? {} : { nome: dados.nome }),
        ...(dados.ativo === undefined ? {} : { ativo: dados.ativo }),
        ...(dados.senhaHash === undefined ? {} : { senhaHash: dados.senhaHash }),
        ...(dados.perfil === undefined ? {} : { perfil: { connect: { codigo: dados.perfil } } }),
      },
      select: UsuariosRepository.SELECAO,
    });
    return this.projetar(bruto);
  }

  async registrarLogin(id: string, momento: Date): Promise<void> {
    await this.prisma.usuario.update({ where: { id }, data: { ultimoLoginEm: momento } });
  }

  async existeAlgumComPerfil(perfil: PerfilCodigo): Promise<boolean> {
    const total = await this.prisma.usuario.count({ where: { perfil: { codigo: perfil } } });
    return total > 0;
  }
}
