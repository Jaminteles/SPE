import { ExecutionContext, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PerfilCodigo } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { UsuarioAutenticado } from '../tipos';
import { DonoDoFormularioGuard } from './dono-do-formulario.guard';

describe('DonoDoFormularioGuard', () => {
  const reflector = { getAllAndOverride: jest.fn() } as unknown as Reflector;
  const findUnique = jest.fn();
  const prisma = { formulario: { findUnique } } as unknown as PrismaService;
  const guard = new DonoDoFormularioGuard(reflector, prisma);

  const contexto = (
    usuario?: UsuarioAutenticado,
    params: Record<string, unknown> = {},
  ): ExecutionContext =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ usuario, params }) }),
      getHandler: () => undefined,
      getClass: () => undefined,
    }) as unknown as ExecutionContext;

  const exigirDono = (parametro?: string) => {
    (reflector.getAllAndOverride as jest.Mock).mockReset().mockReturnValue(parametro);
  };

  const pesquisador: UsuarioAutenticado = {
    id: 'usuario-1',
    perfil: PerfilCodigo.PESQUISADOR,
    sessaoId: 's',
  };
  const outroPesquisador: UsuarioAutenticado = {
    id: 'usuario-2',
    perfil: PerfilCodigo.PESQUISADOR,
    sessaoId: 's',
  };
  const admin: UsuarioAutenticado = {
    id: 'admin-1',
    perfil: PerfilCodigo.ADMINISTRADOR,
    sessaoId: 's',
  };
  const analista: UsuarioAutenticado = {
    id: 'analista-1',
    perfil: PerfilCodigo.ANALISTA,
    sessaoId: 's',
  };

  beforeEach(() => {
    findUnique.mockReset();
  });

  it('não interfere em rota que não pede propriedade', async () => {
    exigirDono(undefined);
    await expect(guard.canActivate(contexto(pesquisador))).resolves.toBe(true);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('deixa o dono passar', async () => {
    exigirDono('formularioId');
    findUnique.mockResolvedValue({ criadoPorId: 'usuario-1' });

    await expect(
      guard.canActivate(contexto(pesquisador, { formularioId: 'form-1' })),
    ).resolves.toBe(true);
  });

  it('recusa pesquisa de outro usuário com 404, não 403', async () => {
    exigirDono('formularioId');
    findUnique.mockResolvedValue({ criadoPorId: 'usuario-1' });

    // 403 confirmaria que a pesquisa existe: a rota viraria um verificador de
    // existência de pesquisa alheia para quem tivesse o id.
    await expect(
      guard.canActivate(contexto(outroPesquisador, { formularioId: 'form-1' })),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('recusa pesquisa inexistente', async () => {
    exigirDono('formularioId');
    findUnique.mockResolvedValue(null);

    await expect(
      guard.canActivate(contexto(pesquisador, { formularioId: 'form-1' })),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('recusa pesquisa órfã, de conta apagada', async () => {
    exigirDono('formularioId');
    findUnique.mockResolvedValue({ criadoPorId: null });

    await expect(
      guard.canActivate(contexto(pesquisador, { formularioId: 'form-1' })),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('deixa o Administrador passar sem consultar dono', async () => {
    exigirDono('formularioId');

    await expect(guard.canActivate(contexto(admin, { formularioId: 'form-1' }))).resolves.toBe(
      true,
    );
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('deixa o Analista passar: a conta existe para ler resultado da equipe', async () => {
    exigirDono('formularioId');

    await expect(guard.canActivate(contexto(analista, { formularioId: 'form-1' }))).resolves.toBe(
      true,
    );
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('recusa quando o parâmetro configurado não existe na rota', async () => {
    // Erro de digitação no decorator não pode virar rota sem checagem nenhuma.
    exigirDono('formularioId');

    await expect(guard.canActivate(contexto(pesquisador, { id: 'form-1' }))).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('recusa requisição sem identidade', async () => {
    exigirDono('formularioId');

    await expect(
      guard.canActivate(contexto(undefined, { formularioId: 'form-1' })),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
