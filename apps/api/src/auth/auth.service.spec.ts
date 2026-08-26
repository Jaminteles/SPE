import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { AuditoriaAcao, PerfilCodigo } from '@prisma/client';

import { AuditoriaService } from '../auditoria/auditoria.service';
import { UsuariosRepository } from '../usuarios/usuarios.repository';
import { AuthService } from './auth.service';
import { SenhaService } from './senha.service';
import { SessaoService } from './sessao.service';

describe('AuthService', () => {
  let servico: AuthService;

  const usuarios = {
    buscarCredencialPorEmail: jest.fn(),
    buscarPorId: jest.fn(),
    registrarLogin: jest.fn(),
  };
  const senhas = { conferir: jest.fn(), gerarHash: jest.fn() };
  const sessoes = { criar: jest.fn(), rotacionar: jest.fn(), encerrar: jest.fn() };
  const auditoria = { registrar: jest.fn() };
  const jwt = { signAsync: jest.fn() };
  const config = { get: jest.fn((_chave: string, padrao: number) => padrao) };

  const credencialValida = {
    id: 'usuario-1',
    senhaHash: 'scrypt$...',
    ativo: true,
    emailConfirmadoEm: new Date('2026-08-01T12:00:00Z'),
    perfil: PerfilCodigo.ADMINISTRADOR,
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    config.get.mockImplementation((_chave: string, padrao: number) => padrao);
    jwt.signAsync.mockResolvedValue('token-assinado');
    sessoes.criar.mockResolvedValue({
      sessaoId: 'sessao-1',
      refreshToken: 'refresh-1',
      expiraEm: new Date(),
    });

    const modulo = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsuariosRepository, useValue: usuarios },
        { provide: SenhaService, useValue: senhas },
        { provide: SessaoService, useValue: sessoes },
        { provide: AuditoriaService, useValue: auditoria },
        { provide: JwtService, useValue: jwt },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();
    servico = modulo.get(AuthService);
  });

  it('emite tokens e audita o login bem-sucedido', async () => {
    usuarios.buscarCredencialPorEmail.mockResolvedValue(credencialValida);
    senhas.conferir.mockResolvedValue(true);

    const resultado = await servico.login('admin@exemplo.br', 'Senha-Muito-Boa-2026');

    expect(resultado.accessToken).toBe('token-assinado');
    expect(resultado.refreshToken).toBe('refresh-1');
    expect(resultado.perfil).toBe(PerfilCodigo.ADMINISTRADOR);
    expect(usuarios.registrarLogin).toHaveBeenCalledWith('usuario-1', expect.any(Date));
    expect(auditoria.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ acao: AuditoriaAcao.LOGIN, usuarioId: 'usuario-1' }),
    );
  });

  it('recusa senha errada com mensagem genérica e audita a falha', async () => {
    usuarios.buscarCredencialPorEmail.mockResolvedValue(credencialValida);
    senhas.conferir.mockResolvedValue(false);

    await expect(servico.login('admin@exemplo.br', 'errada000000')).rejects.toThrow(
      'Credenciais inválidas.',
    );
    expect(auditoria.registrar).toHaveBeenCalledWith(
      expect.objectContaining({
        acao: AuditoriaAcao.LOGIN_FALHA,
        detalhe: { motivo: 'senha_incorreta' },
      }),
    );
  });

  it('paga o custo do hash mesmo sem usuário, para não denunciar quem existe', async () => {
    usuarios.buscarCredencialPorEmail.mockResolvedValue(null);
    senhas.conferir.mockResolvedValue(false);

    await expect(servico.login('inexistente@exemplo.br', 'qualquer00000')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(senhas.conferir).toHaveBeenCalledTimes(1);
    expect(auditoria.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ detalhe: { motivo: 'usuario_inexistente' } }),
    );
  });

  it('recusa login de usuário desativado mesmo com a senha correta', async () => {
    usuarios.buscarCredencialPorEmail.mockResolvedValue({ ...credencialValida, ativo: false });
    senhas.conferir.mockResolvedValue(true);

    await expect(servico.login('admin@exemplo.br', 'Senha-Muito-Boa-2026')).rejects.toThrow(
      'Credenciais inválidas.',
    );
    expect(auditoria.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ detalhe: { motivo: 'usuario_inativo' } }),
    );
  });

  it('recusa login de e-mail ainda não confirmado, dizendo o motivo', async () => {
    usuarios.buscarCredencialPorEmail.mockResolvedValue({
      ...credencialValida,
      emailConfirmadoEm: null,
    });
    senhas.conferir.mockResolvedValue(true);

    // Diferente do resto das falhas de login, esta fala alto: so se chega aqui
    // com a senha correta, entao nao ha o que denunciar a quem nao a sabia.
    await expect(servico.login('admin@exemplo.br', 'Senha-Muito-Boa-2026')).rejects.toThrow(
      /Confirme seu e-mail/,
    );
    expect(auditoria.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ detalhe: { motivo: 'email_nao_confirmado' } }),
    );
  });

  it('não deixa a falta de confirmação vazar para quem erra a senha', async () => {
    usuarios.buscarCredencialPorEmail.mockResolvedValue({
      ...credencialValida,
      emailConfirmadoEm: null,
    });
    senhas.conferir.mockResolvedValue(false);

    await expect(servico.login('admin@exemplo.br', 'errada')).rejects.toThrow(
      'Credenciais inválidas.',
    );
  });
  it('nunca registra a senha nem o token na auditoria', async () => {
    usuarios.buscarCredencialPorEmail.mockResolvedValue(credencialValida);
    senhas.conferir.mockResolvedValue(true);

    await servico.login('admin@exemplo.br', 'Senha-Muito-Boa-2026');

    const registros = JSON.stringify(auditoria.registrar.mock.calls);
    expect(registros).not.toContain('Senha-Muito-Boa-2026');
    expect(registros).not.toContain('token-assinado');
    expect(registros).not.toContain('refresh-1');
  });

  it('recusa renovação de sessão inválida', async () => {
    sessoes.rotacionar.mockResolvedValue(null);

    await expect(servico.renovar('refresh-invalido')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('encerra a sessão do usuário desativado ao tentar renovar', async () => {
    sessoes.rotacionar.mockResolvedValue({
      sessaoId: 'sessao-1',
      usuarioId: 'usuario-1',
      refreshToken: 'refresh-2',
    });
    usuarios.buscarPorId.mockResolvedValue({ id: 'usuario-1', ativo: false });

    await expect(servico.renovar('refresh-1')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(sessoes.encerrar).toHaveBeenCalledWith('sessao-1', 'USUARIO_DESATIVADO');
  });
});
