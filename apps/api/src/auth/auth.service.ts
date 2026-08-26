import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuditoriaAcao, PerfilCodigo, SessaoMotivo } from '@prisma/client';

import { AuditoriaService } from '../auditoria/auditoria.service';
import { UsuariosRepository } from '../usuarios/usuarios.repository';
import { SenhaService } from './senha.service';
import { SessaoService } from './sessao.service';
import { CargaToken } from './tipos';

export interface TokensEmitidos {
  accessToken: string;
  refreshToken: string;
  expiraEmSegundos: number;
  perfil: PerfilCodigo;
}

/**
 * Autenticação por senha, com sessão rastreada no banco.
 *
 * Resposta de falha é sempre a mesma, sem distinguir e-mail inexistente,
 * senha errada ou conta desativada: não damos pista para enumeração de contas.
 */
@Injectable()
export class AuthService {
  /** Hash descartável, usado para igualar o tempo de resposta de e-mail inexistente. */
  private static readonly HASH_FANTASMA =
    'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$' +
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

  private static readonly MENSAGEM_FALHA = 'Credenciais inválidas.';

  constructor(
    private readonly usuarios: UsuariosRepository,
    private readonly senhas: SenhaService,
    private readonly sessoes: SessaoService,
    private readonly auditoria: AuditoriaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async login(email: string, senha: string): Promise<TokensEmitidos> {
    const credencial = await this.usuarios.buscarCredencialPorEmail(email);

    // Mesmo sem usuário, o custo do scrypt é pago: o tempo de resposta não denuncia.
    const senhaConfere = await this.senhas.conferir(
      senha,
      credencial?.senhaHash ?? AuthService.HASH_FANTASMA,
    );

    if (!credencial || !senhaConfere || !credencial.ativo) {
      await this.auditoria.registrar({
        acao: AuditoriaAcao.LOGIN_FALHA,
        entidade: 'usuario',
        entidadeId: credencial?.id ?? null,
        usuarioId: credencial?.id ?? null,
        detalhe: { motivo: this.motivoDaFalha(!!credencial, senhaConfere, credencial?.ativo) },
      });
      throw new UnauthorizedException(AuthService.MENSAGEM_FALHA);
    }

    // Dito em voz alta, ao contrário de todo o resto das falhas de login.
    //
    // Só se chega aqui com a senha correta, então a resposta não denuncia
    // nada a quem não sabia a senha — e quem sabe a senha precisa saber que
    // o que falta é confirmar o e-mail, senão fica preso numa tela que diz
    // "credenciais inválidas" para uma credencial que está certa.
    if (!credencial.emailConfirmadoEm) {
      await this.auditoria.registrar({
        acao: AuditoriaAcao.LOGIN_FALHA,
        entidade: 'usuario',
        entidadeId: credencial.id,
        usuarioId: credencial.id,
        detalhe: { motivo: 'email_nao_confirmado' },
      });
      throw new ForbiddenException(
        'Confirme seu e-mail antes de entrar. Peça um novo link na tela de entrada.',
      );
    }

    const tokens = await this.emitir(credencial.id, credencial.perfil);
    await this.usuarios.registrarLogin(credencial.id, new Date());
    await this.auditoria.registrar({
      acao: AuditoriaAcao.LOGIN,
      entidade: 'usuario',
      entidadeId: credencial.id,
      usuarioId: credencial.id,
      detalhe: { perfil: credencial.perfil },
    });

    return tokens;
  }

  async renovar(refreshToken: string): Promise<TokensEmitidos> {
    const rotacionada = await this.sessoes.rotacionar(
      refreshToken,
      this.config.get<number>('SESSAO_INATIVIDADE_MIN', 30),
    );
    if (!rotacionada) {
      throw new UnauthorizedException('Sessão inválida ou encerrada.');
    }

    const usuario = await this.usuarios.buscarPorId(rotacionada.usuarioId);
    if (!usuario || !usuario.ativo) {
      await this.sessoes.encerrar(rotacionada.sessaoId, SessaoMotivo.USUARIO_DESATIVADO);
      throw new UnauthorizedException('Sessão inválida ou encerrada.');
    }

    return {
      accessToken: await this.assinar(usuario.id, usuario.perfil, rotacionada.sessaoId),
      refreshToken: rotacionada.refreshToken,
      expiraEmSegundos: this.ttlAccessSegundos(),
      perfil: usuario.perfil,
    };
  }

  async logout(usuarioId: string, sessaoId: string): Promise<void> {
    await this.sessoes.encerrar(sessaoId, SessaoMotivo.LOGOUT);
    await this.auditoria.registrar({
      acao: AuditoriaAcao.LOGOUT,
      entidade: 'sessao',
      entidadeId: sessaoId,
      usuarioId,
    });
  }

  private async emitir(usuarioId: string, perfil: PerfilCodigo): Promise<TokensEmitidos> {
    const sessao = await this.sessoes.criar(
      usuarioId,
      this.config.get<number>('SESSAO_ABSOLUTA_HORAS', 8),
    );

    return {
      accessToken: await this.assinar(usuarioId, perfil, sessao.sessaoId),
      refreshToken: sessao.refreshToken,
      expiraEmSegundos: this.ttlAccessSegundos(),
      perfil,
    };
  }

  private assinar(usuarioId: string, perfil: PerfilCodigo, sessaoId: string): Promise<string> {
    const carga: CargaToken = { sub: usuarioId, perfil, sid: sessaoId };
    return this.jwt.signAsync(carga, { expiresIn: this.ttlAccessSegundos() });
  }

  private ttlAccessSegundos(): number {
    return this.config.get<number>('JWT_ACCESS_TTL_MIN', 15) * 60;
  }

  private motivoDaFalha(existe: boolean, senhaConfere: boolean, ativo?: boolean): string {
    if (!existe) {
      return 'usuario_inexistente';
    }
    if (!senhaConfere) {
      return 'senha_incorreta';
    }
    return ativo ? 'desconhecido' : 'usuario_inativo';
  }
}
