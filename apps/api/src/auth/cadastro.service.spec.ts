import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { AuditoriaAcao, PerfilCodigo } from '@prisma/client';

import { AuditoriaService } from '../auditoria/auditoria.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsuariosRepository } from '../usuarios/usuarios.repository';
import { CadastroService } from './cadastro.service';
import { ProvedorDeEmail } from './email.provider';
import { SenhaService } from './senha.service';

describe('CadastroService', () => {
  let servico: CadastroService;

  const prisma = {
    usuario: { findUnique: jest.fn(), update: jest.fn() },
    confirmacaoEmail: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const usuarios = { criar: jest.fn() };
  const senhas = { gerarHash: jest.fn() };
  const email = { enviar: jest.fn() };
  const auditoria = { registrar: jest.fn() };

  const valores: Record<string, unknown> = {
    CADASTRO_ABERTO: true,
    CONFIRMACAO_EMAIL_TTL_HORAS: 24,
    PAINEL_URL: 'https://painel.exemplo.br',
  };
  const config = {
    get: jest.fn((chave: string, padrao?: unknown) => valores[chave] ?? padrao),
  };

  const SENHA_BOA = 'Senha-Muito-Boa-2026';

  beforeEach(async () => {
    jest.resetAllMocks();
    valores.CADASTRO_ABERTO = true;

    config.get.mockImplementation((chave: string, padrao?: unknown) => valores[chave] ?? padrao);
    prisma.$transaction.mockResolvedValue([]);
    senhas.gerarHash.mockResolvedValue('hash');
    usuarios.criar.mockResolvedValue({ id: 'usuario-novo' });

    const modulo = await Test.createTestingModule({
      providers: [
        CadastroService,
        { provide: PrismaService, useValue: prisma },
        { provide: UsuariosRepository, useValue: usuarios },
        { provide: SenhaService, useValue: senhas },
        { provide: ProvedorDeEmail, useValue: email },
        { provide: AuditoriaService, useValue: auditoria },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();

    servico = modulo.get(CadastroService);
  });

  describe('registrar', () => {
    it('cria a conta como Pesquisador e envia a confirmação', async () => {
      prisma.usuario.findUnique.mockResolvedValue(null);

      await servico.registrar({ nome: 'Ana', email: 'Ana@Exemplo.BR', senha: SENHA_BOA });

      expect(usuarios.criar).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'ana@exemplo.br', perfil: PerfilCodigo.PESQUISADOR }),
      );
      expect(email.enviar).toHaveBeenCalledWith(
        expect.objectContaining({ para: 'ana@exemplo.br' }),
      );
      expect(auditoria.registrar).toHaveBeenCalledWith(
        expect.objectContaining({
          acao: AuditoriaAcao.USUARIO_CRIADO,
          usuarioId: null,
          detalhe: expect.objectContaining({ origem: 'auto-cadastro' }),
        }),
      );
    });

    it('responde igual para e-mail que já tem conta confirmada, e não cria nada', async () => {
      prisma.usuario.findUnique.mockResolvedValue({
        id: 'usuario-1',
        emailConfirmadoEm: new Date(),
      });

      const semConta = await (async () => {
        prisma.usuario.findUnique.mockResolvedValueOnce(null);
        return servico.registrar({ nome: 'Ana', email: 'nova@exemplo.br', senha: SENHA_BOA });
      })();

      jest.clearAllMocks();
      prisma.usuario.findUnique.mockResolvedValue({
        id: 'usuario-1',
        emailConfirmadoEm: new Date(),
      });
      const comConta = await servico.registrar({
        nome: 'Ana',
        email: 'ana@exemplo.br',
        senha: SENHA_BOA,
      });

      // Resposta idêntica: é o que impede a rota de virar verificador de cadastro.
      expect(comConta).toBe(semConta);
      expect(usuarios.criar).not.toHaveBeenCalled();
      expect(email.enviar).not.toHaveBeenCalled();
    });

    it('reenvia a confirmação para conta existente que nunca confirmou', async () => {
      prisma.usuario.findUnique.mockResolvedValue({ id: 'usuario-1', emailConfirmadoEm: null });

      await servico.registrar({ nome: 'Ana', email: 'ana@exemplo.br', senha: SENHA_BOA });

      expect(usuarios.criar).not.toHaveBeenCalled();
      expect(email.enviar).toHaveBeenCalled();
    });

    it('recusa senha fraca antes de consultar o banco', async () => {
      await expect(
        servico.registrar({ nome: 'Ana', email: 'ana@exemplo.br', senha: 'fraca' }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prisma.usuario.findUnique).not.toHaveBeenCalled();
    });

    it('recusa quando o cadastro aberto está desligado', async () => {
      valores.CADASTRO_ABERTO = false;

      await expect(
        servico.registrar({ nome: 'Ana', email: 'ana@exemplo.br', senha: SENHA_BOA }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('mantém a conta criada quando o envio do e-mail falha', async () => {
      prisma.usuario.findUnique.mockResolvedValue(null);
      email.enviar.mockRejectedValue(new Error('brevo fora do ar'));

      // Derrubar aqui deixaria o e-mail tomado e a conta inacessível: o pior
      // dos dois mundos. A pessoa pede reenvio.
      await expect(
        servico.registrar({ nome: 'Ana', email: 'ana@exemplo.br', senha: SENHA_BOA }),
      ).resolves.toEqual(expect.any(String));

      expect(usuarios.criar).toHaveBeenCalled();
    });

    it('escapa o nome no corpo HTML do e-mail', async () => {
      prisma.usuario.findUnique.mockResolvedValue(null);

      await servico.registrar({
        nome: '<script>alerta()</script>',
        email: 'ana@exemplo.br',
        senha: SENHA_BOA,
      });

      const [mensagem] = email.enviar.mock.calls[0];
      expect(mensagem.html).not.toContain('<script>');
      expect(mensagem.html).toContain('&lt;script&gt;');
    });
  });

  describe('reenviar', () => {
    it('responde igual para e-mail sem conta nenhuma', async () => {
      prisma.usuario.findUnique.mockResolvedValue(null);

      await expect(servico.reenviar('ninguem@exemplo.br')).resolves.toEqual(expect.any(String));
      expect(email.enviar).not.toHaveBeenCalled();
    });

    it('não reenvia para conta já confirmada', async () => {
      prisma.usuario.findUnique.mockResolvedValue({
        id: 'usuario-1',
        nome: 'Ana',
        ativo: true,
        emailConfirmadoEm: new Date(),
      });

      await servico.reenviar('ana@exemplo.br');
      expect(email.enviar).not.toHaveBeenCalled();
    });

    it('não reenvia para conta desativada', async () => {
      prisma.usuario.findUnique.mockResolvedValue({
        id: 'usuario-1',
        nome: 'Ana',
        ativo: false,
        emailConfirmadoEm: null,
      });

      await servico.reenviar('ana@exemplo.br');
      expect(email.enviar).not.toHaveBeenCalled();
    });
  });

  describe('confirmar', () => {
    it('recusa token inexistente', async () => {
      prisma.confirmacaoEmail.findUnique.mockResolvedValue(null);

      await expect(servico.confirmar('qualquer')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('recusa token já usado', async () => {
      prisma.confirmacaoEmail.findUnique.mockResolvedValue({
        id: 'c1',
        usuarioId: 'usuario-1',
        expiraEm: new Date(Date.now() + 60_000),
        usadoEm: new Date(),
      });

      await expect(servico.confirmar('qualquer')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('recusa token vencido', async () => {
      prisma.confirmacaoEmail.findUnique.mockResolvedValue({
        id: 'c1',
        usuarioId: 'usuario-1',
        expiraEm: new Date(Date.now() - 60_000),
        usadoEm: null,
      });

      await expect(servico.confirmar('qualquer')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('confirma e audita', async () => {
      prisma.confirmacaoEmail.findUnique.mockResolvedValue({
        id: 'c1',
        usuarioId: 'usuario-1',
        expiraEm: new Date(Date.now() + 60_000),
        usadoEm: null,
      });

      await servico.confirmar('token-bom');

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(auditoria.registrar).toHaveBeenCalledWith(
        expect.objectContaining({ acao: AuditoriaAcao.EMAIL_CONFIRMADO }),
      );
    });

    it('guarda o token como hash, nunca em claro', async () => {
      prisma.confirmacaoEmail.findUnique.mockResolvedValue(null);

      await expect(servico.confirmar('token-em-claro')).rejects.toBeInstanceOf(BadRequestException);

      const [{ where }] = prisma.confirmacaoEmail.findUnique.mock.calls[0];
      expect(where.tokenHash).not.toBe('token-em-claro');
      expect(where.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    });
  });
});
