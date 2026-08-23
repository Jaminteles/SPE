import { PerfilCodigo, SessaoMotivo } from '@prisma/client';
import { Test } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';
import { SessaoService } from './sessao.service';

describe('SessaoService', () => {
  let servico: SessaoService;
  const prisma = {
    sessao: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  };

  const sessaoViva = (ajustes: Partial<Record<string, unknown>> = {}) => ({
    usuarioId: 'usuario-1',
    ultimaAtividadeEm: new Date(),
    expiraEm: new Date(Date.now() + 3_600_000),
    encerradaEm: null,
    motivoEncerramento: null,
    usuario: { ativo: true, perfil: { codigo: PerfilCodigo.ANALISTA } },
    ...ajustes,
  });

  beforeEach(async () => {
    jest.resetAllMocks();
    prisma.sessao.updateMany.mockResolvedValue({ count: 1 });
    const modulo = await Test.createTestingModule({
      providers: [SessaoService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    servico = modulo.get(SessaoService);
  });

  it('guarda apenas o hash do refresh token, nunca o valor em claro', async () => {
    prisma.sessao.create.mockResolvedValue({ id: 'sessao-1' });

    const criada = await servico.criar('usuario-1', 8);

    const gravado = prisma.sessao.create.mock.calls[0][0].data;
    expect(gravado.refreshTokenHash).toBe(SessaoService.hashDeToken(criada.refreshToken));
    expect(gravado.refreshTokenHash).not.toBe(criada.refreshToken);
    expect(gravado.refreshTokenHash).toHaveLength(64);
  });

  it('aceita sessão dentro do limite e devolve o perfil vindo do banco', async () => {
    prisma.sessao.findUnique.mockResolvedValue(sessaoViva());

    const resultado = await servico.validarAtividade('sessao-1', 30);

    expect(resultado).toEqual({
      valida: true,
      usuarioId: 'usuario-1',
      perfil: PerfilCodigo.ANALISTA,
    });
  });

  it('encerra a sessão parada além do limite de inatividade', async () => {
    prisma.sessao.findUnique.mockResolvedValue(
      sessaoViva({ ultimaAtividadeEm: new Date(Date.now() - 31 * 60_000) }),
    );

    const resultado = await servico.validarAtividade('sessao-1', 30);

    expect(resultado).toEqual({ valida: false, motivo: SessaoMotivo.INATIVIDADE });
    expect(prisma.sessao.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ motivoEncerramento: SessaoMotivo.INATIVIDADE }),
      }),
    );
  });

  it('encerra a sessão que passou da validade absoluta', async () => {
    prisma.sessao.findUnique.mockResolvedValue(
      sessaoViva({ expiraEm: new Date(Date.now() - 1_000) }),
    );

    await expect(servico.validarAtividade('sessao-1', 30)).resolves.toEqual({
      valida: false,
      motivo: SessaoMotivo.EXPIRACAO,
    });
  });

  it('recusa sessão de usuário desativado e a encerra', async () => {
    prisma.sessao.findUnique.mockResolvedValue(
      sessaoViva({ usuario: { ativo: false, perfil: { codigo: PerfilCodigo.ADMINISTRADOR } } }),
    );

    await expect(servico.validarAtividade('sessao-1', 30)).resolves.toEqual({
      valida: false,
      motivo: SessaoMotivo.USUARIO_DESATIVADO,
    });
  });

  it('recusa sessão já encerrada', async () => {
    prisma.sessao.findUnique.mockResolvedValue(
      sessaoViva({ encerradaEm: new Date(), motivoEncerramento: SessaoMotivo.LOGOUT }),
    );

    await expect(servico.validarAtividade('sessao-1', 30)).resolves.toEqual({
      valida: false,
      motivo: SessaoMotivo.LOGOUT,
    });
  });

  it('não atualiza a atividade a cada requisição', async () => {
    prisma.sessao.findUnique.mockResolvedValue(sessaoViva());

    await servico.validarAtividade('sessao-1', 30);

    expect(prisma.sessao.update).not.toHaveBeenCalled();
  });

  describe('rotacionar', () => {
    it('troca o refresh token por um novo a cada uso', async () => {
      prisma.sessao.findUnique.mockResolvedValue({
        id: 'sessao-1',
        usuarioId: 'usuario-1',
        ultimaAtividadeEm: new Date(),
        expiraEm: new Date(Date.now() + 3_600_000),
        encerradaEm: null,
      });

      const resultado = await servico.rotacionar('token-antigo', 30);

      expect(resultado?.refreshToken).toBeDefined();
      expect(resultado?.refreshToken).not.toBe('token-antigo');
      expect(prisma.sessao.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            refreshTokenHash: SessaoService.hashDeToken(resultado!.refreshToken),
          }),
        }),
      );
    });

    it('recusa refresh token de sessão encerrada', async () => {
      prisma.sessao.findUnique.mockResolvedValue({
        id: 'sessao-1',
        usuarioId: 'usuario-1',
        ultimaAtividadeEm: new Date(),
        expiraEm: new Date(Date.now() + 3_600_000),
        encerradaEm: new Date(),
      });

      await expect(servico.rotacionar('token', 30)).resolves.toBeNull();
    });

    it('recusa refresh token desconhecido', async () => {
      prisma.sessao.findUnique.mockResolvedValue(null);

      await expect(servico.rotacionar('token-inventado', 30)).resolves.toBeNull();
    });
  });
});
