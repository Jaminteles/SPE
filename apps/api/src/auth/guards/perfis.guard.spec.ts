import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PerfilCodigo } from '@prisma/client';

import { UsuarioAutenticado } from '../tipos';
import { PerfisGuard } from './perfis.guard';

describe('PerfisGuard', () => {
  const reflector = { getAllAndOverride: jest.fn() } as unknown as Reflector;
  const guard = new PerfisGuard(reflector);

  const contexto = (usuario?: UsuarioAutenticado, body?: unknown): ExecutionContext =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ usuario, body }) }),
      getHandler: () => undefined,
      getClass: () => undefined,
    }) as unknown as ExecutionContext;

  const configurar = (publica: boolean, perfis?: PerfilCodigo[]) => {
    (reflector.getAllAndOverride as jest.Mock)
      .mockReset()
      .mockImplementationOnce(() => publica)
      .mockImplementationOnce(() => perfis);
  };

  const admin: UsuarioAutenticado = {
    id: 'a',
    perfil: PerfilCodigo.ADMINISTRADOR,
    sessaoId: 's',
  };
  const analista: UsuarioAutenticado = { id: 'b', perfil: PerfilCodigo.ANALISTA, sessaoId: 's' };

  it('libera rota pública sem olhar perfil', () => {
    configurar(true);
    expect(guard.canActivate(contexto())).toBe(true);
  });

  it('libera rota autenticada que não exige perfil específico', () => {
    configurar(false, undefined);
    expect(guard.canActivate(contexto(analista))).toBe(true);
  });

  it('permite o Administrador em rota de administração', () => {
    configurar(false, [PerfilCodigo.ADMINISTRADOR]);
    expect(guard.canActivate(contexto(admin))).toBe(true);
  });

  it('bloqueia o Analista em rota de administração', () => {
    configurar(false, [PerfilCodigo.ADMINISTRADOR]);
    expect(() => guard.canActivate(contexto(analista))).toThrow(ForbiddenException);
  });

  it('ignora perfil vindo do corpo da requisição', () => {
    configurar(false, [PerfilCodigo.ADMINISTRADOR]);
    expect(() =>
      guard.canActivate(contexto(analista, { perfil: PerfilCodigo.ADMINISTRADOR })),
    ).toThrow(ForbiddenException);
  });

  it('bloqueia requisição sem identidade', () => {
    configurar(false, [PerfilCodigo.ADMINISTRADOR]);
    expect(() => guard.canActivate(contexto(undefined))).toThrow(ForbiddenException);
  });
});
