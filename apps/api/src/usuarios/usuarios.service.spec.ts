import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AuditoriaAcao, PerfilCodigo, SessaoMotivo } from '@prisma/client';

import { AuditoriaService } from '../auditoria/auditoria.service';
import { SenhaService } from '../auth/senha.service';
import { SessaoService } from '../auth/sessao.service';
import { UsuariosRepository } from './usuarios.repository';
import { UsuariosService } from './usuarios.service';

describe('UsuariosService', () => {
  let servico: UsuariosService;

  const repositorio = {
    listar: jest.fn(),
    buscarPorId: jest.fn(),
    buscarCredencialPorId: jest.fn(),
    criar: jest.fn(),
    atualizar: jest.fn(),
  };
  const senhas = { gerarHash: jest.fn(), conferir: jest.fn() };
  const sessoes = { encerrarTodasDoUsuario: jest.fn() };
  const auditoria = { registrar: jest.fn() };

  const analista = {
    id: 'analista-1',
    nome: 'Ana',
    email: 'ana@exemplo.br',
    ativo: true,
    perfil: PerfilCodigo.ANALISTA,
    ultimoLoginEm: null,
    criadoEm: new Date(),
  };
  const admin = { ...analista, id: 'admin-1', perfil: PerfilCodigo.ADMINISTRADOR };

  beforeEach(async () => {
    jest.resetAllMocks();
    senhas.gerarHash.mockResolvedValue('scrypt$hash');
    repositorio.atualizar.mockImplementation(async (id: string) => ({ ...analista, id }));

    const modulo = await Test.createTestingModule({
      providers: [
        UsuariosService,
        { provide: UsuariosRepository, useValue: repositorio },
        { provide: SenhaService, useValue: senhas },
        { provide: SessaoService, useValue: sessoes },
        { provide: AuditoriaService, useValue: auditoria },
      ],
    }).compile();
    servico = modulo.get(UsuariosService);
  });

  it('recusa criação com senha fraca antes de tocar no banco', async () => {
    await expect(
      servico.criar(
        {
          nome: 'Ana',
          email: 'ana@exemplo.br',
          senha: 'fraquinha123',
          perfil: PerfilCodigo.ANALISTA,
        },
        'admin-1',
      ),
    ).rejects.toThrow();
    expect(repositorio.criar).not.toHaveBeenCalled();
  });

  it('audita a criação de usuário sem registrar a senha', async () => {
    repositorio.criar.mockResolvedValue(analista);

    await servico.criar(
      {
        nome: 'Ana',
        email: 'ana@exemplo.br',
        senha: 'Senha-Muito-Boa-2026',
        perfil: PerfilCodigo.ANALISTA,
      },
      'admin-1',
    );

    expect(auditoria.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ acao: AuditoriaAcao.USUARIO_CRIADO, usuarioId: 'admin-1' }),
    );
    expect(JSON.stringify(auditoria.registrar.mock.calls)).not.toContain('Senha-Muito-Boa-2026');
  });

  it('impede o administrador de desativar a própria conta', async () => {
    repositorio.buscarPorId.mockResolvedValue(admin);

    await expect(servico.atualizar('admin-1', { ativo: false }, 'admin-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('impede desativar o último administrador ativo', async () => {
    repositorio.buscarPorId.mockResolvedValue(admin);
    repositorio.listar.mockResolvedValue({ itens: [admin], total: 1 });

    await expect(
      servico.atualizar('admin-1', { ativo: false }, 'outro-admin'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('encerra as sessões ao desativar um usuário', async () => {
    repositorio.buscarPorId.mockResolvedValue(analista);

    await servico.atualizar('analista-1', { ativo: false }, 'admin-1');

    expect(sessoes.encerrarTodasDoUsuario).toHaveBeenCalledWith(
      'analista-1',
      SessaoMotivo.USUARIO_DESATIVADO,
    );
    expect(auditoria.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ acao: AuditoriaAcao.USUARIO_DESATIVADO }),
    );
  });

  it('audita a mudança de perfil e derruba as sessões abertas', async () => {
    repositorio.buscarPorId.mockResolvedValue(analista);

    await servico.alterarPerfil('analista-1', PerfilCodigo.ADMINISTRADOR, 'admin-1');

    expect(sessoes.encerrarTodasDoUsuario).toHaveBeenCalledWith(
      'analista-1',
      SessaoMotivo.PERMISSAO_ALTERADA,
    );
    expect(auditoria.registrar).toHaveBeenCalledWith(
      expect.objectContaining({
        acao: AuditoriaAcao.PERMISSAO_ALTERADA,
        detalhe: { de: PerfilCodigo.ANALISTA, para: PerfilCodigo.ADMINISTRADOR },
      }),
    );
  });

  it('impede o administrador de alterar o próprio perfil', async () => {
    repositorio.buscarPorId.mockResolvedValue(admin);

    await expect(
      servico.alterarPerfil('admin-1', PerfilCodigo.ANALISTA, 'admin-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('exige a senha atual correta para a troca da própria senha', async () => {
    repositorio.buscarCredencialPorId.mockResolvedValue({
      id: 'analista-1',
      senhaHash: 'scrypt$hash',
      ativo: true,
      perfil: PerfilCodigo.ANALISTA,
    });
    senhas.conferir.mockResolvedValue(false);

    await expect(
      servico.trocarPropriaSenha('analista-1', 'sessao-1', 'errada000000', 'Senha-Muito-Boa-2026'),
    ).rejects.toThrow('Senha atual incorreta.');
    expect(repositorio.atualizar).not.toHaveBeenCalled();
  });

  it('derruba as sessões ao trocar a própria senha', async () => {
    repositorio.buscarCredencialPorId.mockResolvedValue({
      id: 'analista-1',
      senhaHash: 'scrypt$hash',
      ativo: true,
      perfil: PerfilCodigo.ANALISTA,
    });
    senhas.conferir.mockResolvedValue(true);

    await servico.trocarPropriaSenha(
      'analista-1',
      'sessao-1',
      'Senha-Antiga-2026',
      'Senha-Muito-Boa-2026',
    );

    expect(sessoes.encerrarTodasDoUsuario).toHaveBeenCalledWith(
      'analista-1',
      SessaoMotivo.SENHA_ALTERADA,
    );
  });
});
