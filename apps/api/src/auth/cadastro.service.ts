import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditoriaAcao, PerfilCodigo } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';

import { AuditoriaService } from '../auditoria/auditoria.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsuariosRepository } from '../usuarios/usuarios.repository';
import { ProvedorDeEmail } from './email.provider';
import { SenhaService } from './senha.service';

/**
 * Auto-cadastro com confirmação de e-mail.
 *
 * Duas ideias sustentam tudo aqui:
 *
 * 1. **Nada do que a rota responde denuncia se um e-mail já tem conta.** Cadastro
 *    e reenvio respondem sempre a mesma coisa. Uma resposta diferente para
 *    e-mail existente transformaria a rota num verificador de cadastro — e como
 *    o e-mail costuma ser o mesmo em vários serviços, isso é dado de terceiro,
 *    não nosso.
 *
 * 2. **A conta nasce trancada.** Sem confirmação não há login. É o que impede
 *    cadastro no e-mail de outra pessoa e cadastro em massa com endereço
 *    inventado.
 */
@Injectable()
export class CadastroService {
  private readonly logger = new Logger(CadastroService.name);

  /** 32 bytes: o token é a credencial da confirmação, não um número de protocolo. */
  private static readonly BYTES_DO_TOKEN = 32;

  private static readonly RESPOSTA_NEUTRA =
    'Se este e-mail puder receber uma conta, o link de confirmação chega em instantes. ' +
    'Confira também a caixa de spam.';

  constructor(
    private readonly prisma: PrismaService,
    private readonly usuarios: UsuariosRepository,
    private readonly senhas: SenhaService,
    private readonly email: ProvedorDeEmail,
    private readonly auditoria: AuditoriaService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Registra uma conta nova e dispara a confirmação.
   *
   * Devolve sempre a mesma mensagem, tenha criado conta ou não.
   */
  async registrar(dados: { nome: string; email: string; senha: string }): Promise<string> {
    this.exigirCadastroAberto();

    // A força da senha é conferida antes de qualquer consulta: é a única crítica
    // que pode falar alto sem revelar nada sobre quem já tem conta.
    const problemas = SenhaService.validarForca(dados.senha);
    if (problemas.length > 0) {
      throw new BadRequestException(problemas);
    }

    const email = UsuariosRepository.normalizarEmail(dados.email);
    const existente = await this.prisma.usuario.findUnique({
      where: { email },
      select: { id: true, emailConfirmadoEm: true },
    });

    if (existente) {
      // Conta criada e nunca confirmada pode ter sido um e-mail que não chegou:
      // reenviar é o que destrava sem abrir caminho para sobrescrever conta
      // alheia. Conta já confirmada não recebe nada — quem esqueceu a senha usa
      // recuperação de senha, não cadastro.
      if (!existente.emailConfirmadoEm) {
        await this.dispararConfirmacao(existente.id, dados.nome, email);
      }
      return CadastroService.RESPOSTA_NEUTRA;
    }

    const senhaHash = await this.senhas.gerarHash(dados.senha);
    const criado = await this.usuarios.criar({
      nome: dados.nome,
      email,
      senhaHash,
      perfil: PerfilCodigo.PESQUISADOR,
    });

    await this.auditoria.registrar({
      acao: AuditoriaAcao.USUARIO_CRIADO,
      entidade: 'usuario',
      entidadeId: criado.id,
      // Sem autor: ninguém da equipe criou esta conta, ela se criou sozinha.
      usuarioId: null,
      detalhe: { perfil: PerfilCodigo.PESQUISADOR, origem: 'auto-cadastro' },
    });

    await this.dispararConfirmacao(criado.id, dados.nome, email);
    return CadastroService.RESPOSTA_NEUTRA;
  }

  /** Reenvia a confirmação. Responde igual para e-mail com ou sem conta. */
  async reenviar(emailBruto: string): Promise<string> {
    this.exigirCadastroAberto();

    const email = UsuariosRepository.normalizarEmail(emailBruto);
    const usuario = await this.prisma.usuario.findUnique({
      where: { email },
      select: { id: true, nome: true, emailConfirmadoEm: true, ativo: true },
    });

    if (usuario && usuario.ativo && !usuario.emailConfirmadoEm) {
      await this.dispararConfirmacao(usuario.id, usuario.nome, email);
    }

    return CadastroService.RESPOSTA_NEUTRA;
  }

  /**
   * Confirma a posse do e-mail.
   *
   * O token é de uso único e some do caminho ao ser usado: link reencaminhado
   * ou guardado no histórico do navegador não vale uma segunda vez.
   */
  async confirmar(token: string): Promise<void> {
    const tokenHash = CadastroService.hash(token);
    const agora = new Date();

    const registro = await this.prisma.confirmacaoEmail.findUnique({
      where: { tokenHash },
      select: { id: true, usuarioId: true, expiraEm: true, usadoEm: true },
    });

    if (!registro || registro.usadoEm || registro.expiraEm <= agora) {
      throw new BadRequestException(
        'Link de confirmação inválido ou vencido. Peça um novo na tela de entrada.',
      );
    }

    await this.prisma.$transaction([
      this.prisma.confirmacaoEmail.update({
        where: { id: registro.id },
        data: { usadoEm: agora },
      }),
      this.prisma.usuario.update({
        where: { id: registro.usuarioId },
        data: { emailConfirmadoEm: agora },
      }),
      // Os outros tokens do mesmo usuário morrem junto: confirmada a posse, um
      // link antigo ainda válido só serviria para reabrir a mesma porta.
      this.prisma.confirmacaoEmail.updateMany({
        where: { usuarioId: registro.usuarioId, usadoEm: null },
        data: { usadoEm: agora },
      }),
    ]);

    await this.auditoria.registrar({
      acao: AuditoriaAcao.EMAIL_CONFIRMADO,
      entidade: 'usuario',
      entidadeId: registro.usuarioId,
      usuarioId: registro.usuarioId,
    });
  }

  private exigirCadastroAberto(): void {
    if (!this.config.get<boolean>('CADASTRO_ABERTO')) {
      throw new ForbiddenException('O cadastro nesta instalação é feito por um administrador.');
    }
  }

  /**
   * Gera o token, invalida os anteriores e envia o e-mail.
   *
   * Falha de envio não derruba o cadastro: a conta fica criada e a pessoa pede
   * reenvio. Derrubar aqui deixaria o cadastro pela metade — e-mail já tomado,
   * conta inacessível — que é o pior dos dois mundos.
   */
  private async dispararConfirmacao(usuarioId: string, nome: string, email: string): Promise<void> {
    const token = randomBytes(CadastroService.BYTES_DO_TOKEN).toString('base64url');
    const horas = this.config.get<number>('CONFIRMACAO_EMAIL_TTL_HORAS', 24);
    const expiraEm = new Date(Date.now() + horas * 60 * 60 * 1000);

    await this.prisma.$transaction([
      // Pedir um link novo aposenta o anterior: dois links vivos ao mesmo tempo
      // dobram a janela de quem interceptou o primeiro.
      this.prisma.confirmacaoEmail.updateMany({
        where: { usuarioId, usadoEm: null },
        data: { usadoEm: new Date() },
      }),
      this.prisma.confirmacaoEmail.create({
        data: { usuarioId, tokenHash: CadastroService.hash(token), expiraEm },
      }),
    ]);

    const url = `${this.config.get<string>('PAINEL_URL')}/confirmar.html?t=${token}`;

    try {
      await this.email.enviar({
        para: email,
        nomeDoDestinatario: nome,
        assunto: 'Confirme seu cadastro',
        texto: CadastroService.corpoEmTexto(nome, url, horas),
        html: CadastroService.corpoEmHtml(nome, url, horas),
      });
    } catch (erro) {
      // O endereço não vai para o log: log de aplicação não é lugar de dado de
      // contato, e este erro será lido por quem opera, não por quem se cadastrou.
      this.logger.error(
        'Falha ao enviar e-mail de confirmação.',
        erro instanceof Error ? erro.stack : undefined,
      );
    }
  }

  private static hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private static corpoEmTexto(nome: string, url: string, horas: number): string {
    return [
      `Olá, ${nome}.`,
      '',
      'Para ativar sua conta, abra o endereço abaixo:',
      url,
      '',
      `O link vale por ${horas} horas.`,
      '',
      'Se não foi você quem pediu este cadastro, ignore esta mensagem: sem abrir',
      'o link, nenhuma conta é ativada.',
    ].join('\n');
  }

  private static corpoEmHtml(nome: string, url: string, horas: number): string {
    // HTML mínimo e sem imagem: o que precisa funcionar é o link, e cliente de
    // e-mail corporativo costuma bloquear o resto.
    return [
      '<p>Olá, ' + CadastroService.escapar(nome) + '.</p>',
      '<p>Para ativar sua conta, clique no link abaixo:</p>',
      '<p><a href="' + CadastroService.escapar(url) + '">Confirmar meu cadastro</a></p>',
      '<p>O link vale por ' + horas + ' horas.</p>',
      '<p>Se não foi você quem pediu este cadastro, ignore esta mensagem: sem abrir o link, ' +
        'nenhuma conta é ativada.</p>',
    ].join('');
  }

  /** O nome vem de quem se cadastrou: entra no HTML como texto, nunca como marcação. */
  private static escapar(valor: string): string {
    return valor
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
