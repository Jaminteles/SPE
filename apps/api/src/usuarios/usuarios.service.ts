import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { AuditoriaAcao, PerfilCodigo, Prisma, SessaoMotivo } from '@prisma/client';

import { AuditoriaService } from '../auditoria/auditoria.service';
import { SenhaService } from '../auth/senha.service';
import { SessaoService } from '../auth/sessao.service';
import {
  AtualizarUsuarioDto,
  CriarUsuarioDto,
  ListarUsuariosDto,
  UsuarioResponse,
} from './dto/usuarios.dto';
import { UsuariosRepository } from './usuarios.repository';

const LIMITE_PADRAO = 50;

@Injectable()
export class UsuariosService {
  constructor(
    private readonly repositorio: UsuariosRepository,
    private readonly senhas: SenhaService,
    private readonly sessoes: SessaoService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async listar(filtro: ListarUsuariosDto) {
    return this.repositorio.listar({
      ativo: filtro.ativo,
      perfil: filtro.perfil,
      limite: filtro.limite ?? LIMITE_PADRAO,
      deslocamento: filtro.deslocamento ?? 0,
    });
  }

  async buscar(id: string): Promise<UsuarioResponse> {
    const usuario = await this.repositorio.buscarPorId(id);
    if (!usuario) {
      throw new NotFoundException('Usuário não encontrado.');
    }
    return usuario;
  }

  async criar(dto: CriarUsuarioDto, autorId: string): Promise<UsuarioResponse> {
    this.exigirSenhaForte(dto.senha);

    const senhaHash = await this.senhas.gerarHash(dto.senha);

    let criado: UsuarioResponse;
    try {
      criado = await this.repositorio.criar({
        nome: dto.nome,
        email: dto.email,
        senhaHash,
        perfil: dto.perfil,
        // Nasce confirmada: quem cria é um Administrador, que digitou o e-mail
        // e entrega a senha em mãos. Esta rota não envia e-mail nenhum, então
        // deixar pendente trancaria a conta sem caminho de volta.
        emailConfirmadoEm: new Date(),
      });
    } catch (erro) {
      throw this.traduzirErroDePrisma(erro);
    }

    await this.auditoria.registrar({
      acao: AuditoriaAcao.USUARIO_CRIADO,
      entidade: 'usuario',
      entidadeId: criado.id,
      usuarioId: autorId,
      detalhe: { perfil: criado.perfil },
    });

    return criado;
  }

  async atualizar(id: string, dto: AtualizarUsuarioDto, autorId: string): Promise<UsuarioResponse> {
    const atual = await this.buscar(id);

    if (dto.ativo === false) {
      if (id === autorId) {
        throw new ForbiddenException('Um administrador não pode desativar a própria conta.');
      }
      await this.garantirQueRestaAdministrador(atual);
    }

    const atualizado = await this.repositorio.atualizar(id, {
      nome: dto.nome,
      ativo: dto.ativo,
    });

    if (dto.ativo === false) {
      await this.sessoes.encerrarTodasDoUsuario(id, SessaoMotivo.USUARIO_DESATIVADO);
    }

    await this.auditoria.registrar({
      acao: dto.ativo === false ? AuditoriaAcao.USUARIO_DESATIVADO : AuditoriaAcao.USUARIO_ALTERADO,
      entidade: 'usuario',
      entidadeId: id,
      usuarioId: autorId,
      detalhe: {
        nomeAlterado: dto.nome !== undefined,
        ativo: dto.ativo ?? atual.ativo,
      },
    });

    return atualizado;
  }

  async alterarPerfil(id: string, perfil: PerfilCodigo, autorId: string): Promise<UsuarioResponse> {
    const atual = await this.buscar(id);

    if (atual.perfil === perfil) {
      return atual;
    }
    if (id === autorId) {
      throw new ForbiddenException('Um administrador não pode alterar o próprio perfil.');
    }
    await this.garantirQueRestaAdministrador(atual);

    const atualizado = await this.repositorio.atualizar(id, { perfil });

    // Permissão mudou: as sessões abertas morrem para não carregarem o poder antigo.
    await this.sessoes.encerrarTodasDoUsuario(id, SessaoMotivo.PERMISSAO_ALTERADA);

    await this.auditoria.registrar({
      acao: AuditoriaAcao.PERMISSAO_ALTERADA,
      entidade: 'usuario',
      entidadeId: id,
      usuarioId: autorId,
      detalhe: { de: atual.perfil, para: perfil },
    });

    return atualizado;
  }

  async redefinirSenha(id: string, novaSenha: string, autorId: string): Promise<void> {
    await this.buscar(id);
    this.exigirSenhaForte(novaSenha);

    await this.repositorio.atualizar(id, { senhaHash: await this.senhas.gerarHash(novaSenha) });
    await this.sessoes.encerrarTodasDoUsuario(id, SessaoMotivo.SENHA_ALTERADA);

    await this.auditoria.registrar({
      acao: AuditoriaAcao.SENHA_ALTERADA,
      entidade: 'usuario',
      entidadeId: id,
      usuarioId: autorId,
      detalhe: { redefinidaPorAdministrador: id !== autorId },
    });
  }

  /** Troca da própria senha: exige a senha atual e derruba as demais sessões. */
  async trocarPropriaSenha(
    usuarioId: string,
    sessaoAtual: string,
    senhaAtual: string,
    novaSenha: string,
  ): Promise<void> {
    const credencial = await this.repositorio.buscarCredencialPorId(usuarioId);
    if (!credencial || !(await this.senhas.conferir(senhaAtual, credencial.senhaHash))) {
      throw new UnauthorizedException('Senha atual incorreta.');
    }

    this.exigirSenhaForte(novaSenha);
    if (senhaAtual === novaSenha) {
      throw new BadRequestException('A nova senha precisa ser diferente da atual.');
    }

    await this.repositorio.atualizar(usuarioId, {
      senhaHash: await this.senhas.gerarHash(novaSenha),
    });
    await this.sessoes.encerrarTodasDoUsuario(usuarioId, SessaoMotivo.SENHA_ALTERADA);

    await this.auditoria.registrar({
      acao: AuditoriaAcao.SENHA_ALTERADA,
      entidade: 'usuario',
      entidadeId: usuarioId,
      usuarioId,
      detalhe: { redefinidaPorAdministrador: false, sessaoOrigem: sessaoAtual },
    });
  }

  private exigirSenhaForte(senha: string): void {
    const problemas = SenhaService.validarForca(senha);
    if (problemas.length > 0) {
      throw new BadRequestException(problemas);
    }
  }

  /** Impede que o sistema fique sem nenhum administrador ativo. */
  private async garantirQueRestaAdministrador(alvo: UsuarioResponse): Promise<void> {
    if (alvo.perfil !== PerfilCodigo.ADMINISTRADOR || !alvo.ativo) {
      return;
    }
    const { total } = await this.repositorio.listar({
      ativo: true,
      perfil: PerfilCodigo.ADMINISTRADOR,
      limite: 1,
      deslocamento: 0,
    });
    if (total <= 1) {
      throw new ConflictException('O sistema precisa de ao menos um administrador ativo.');
    }
  }

  private traduzirErroDePrisma(erro: unknown): Error {
    if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002') {
      return new ConflictException('Já existe usuário com este e-mail.');
    }
    return erro instanceof Error ? erro : new Error('Falha ao gravar usuário.');
  }
}
