import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PerfilCodigo } from '@prisma/client';

import { Perfis } from '../auth/decorators/perfis.decorator';
import { UsuarioAtual } from '../auth/decorators/usuario-atual.decorator';
import { UsuarioAutenticado } from '../auth/tipos';
import {
  AlterarPerfilDto,
  AtualizarUsuarioDto,
  CriarUsuarioDto,
  ListaUsuariosResponse,
  ListarUsuariosDto,
  RedefinirSenhaDto,
  TrocarSenhaDto,
  UsuarioResponse,
} from './dto/usuarios.dto';
import { UsuariosService } from './usuarios.service';

/**
 * Administração de usuários.
 *
 * Todas as rotas de gestão exigem perfil Administrador: o Analista recebe 403
 * mesmo trocando o id na rota, no body ou na query. A única rota aberta a
 * qualquer autenticado é a troca da própria senha, que age sempre sobre o
 * usuário do token.
 */
@ApiTags('usuarios')
@ApiBearerAuth()
@Controller('usuarios')
export class UsuariosController {
  constructor(private readonly servico: UsuariosService) {}

  @Patch('eu/senha')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Troca a senha do próprio usuário.' })
  async trocarPropriaSenha(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Body() dto: TrocarSenhaDto,
  ): Promise<void> {
    await this.servico.trocarPropriaSenha(
      usuario.id,
      usuario.sessaoId,
      dto.senhaAtual,
      dto.novaSenha,
    );
  }

  @Perfis(PerfilCodigo.ADMINISTRADOR)
  @Get()
  @ApiOperation({ summary: 'Lista usuários.' })
  @ApiOkResponse({ type: ListaUsuariosResponse })
  async listar(@Query() filtro: ListarUsuariosDto): Promise<ListaUsuariosResponse> {
    return this.servico.listar(filtro);
  }

  @Perfis(PerfilCodigo.ADMINISTRADOR)
  @Get(':id')
  @ApiOperation({ summary: 'Consulta um usuário.' })
  @ApiOkResponse({ type: UsuarioResponse })
  async buscar(@Param('id', ParseUUIDPipe) id: string): Promise<UsuarioResponse> {
    return this.servico.buscar(id);
  }

  @Perfis(PerfilCodigo.ADMINISTRADOR)
  @Post()
  @ApiOperation({ summary: 'Cria usuário.' })
  @ApiOkResponse({ type: UsuarioResponse })
  async criar(
    @UsuarioAtual() autor: UsuarioAutenticado,
    @Body() dto: CriarUsuarioDto,
  ): Promise<UsuarioResponse> {
    return this.servico.criar(dto, autor.id);
  }

  @Perfis(PerfilCodigo.ADMINISTRADOR)
  @Patch(':id')
  @ApiOperation({ summary: 'Altera nome ou situação do usuário.' })
  @ApiOkResponse({ type: UsuarioResponse })
  async atualizar(
    @UsuarioAtual() autor: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AtualizarUsuarioDto,
  ): Promise<UsuarioResponse> {
    return this.servico.atualizar(id, dto, autor.id);
  }

  @Perfis(PerfilCodigo.ADMINISTRADOR)
  @Patch(':id/perfil')
  @ApiOperation({ summary: 'Altera o perfil de acesso do usuário.' })
  @ApiOkResponse({ type: UsuarioResponse })
  async alterarPerfil(
    @UsuarioAtual() autor: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AlterarPerfilDto,
  ): Promise<UsuarioResponse> {
    return this.servico.alterarPerfil(id, dto.perfil, autor.id);
  }

  @Perfis(PerfilCodigo.ADMINISTRADOR)
  @Patch(':id/senha')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Redefine a senha de um usuário.' })
  async redefinirSenha(
    @UsuarioAtual() autor: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RedefinirSenhaDto,
  ): Promise<void> {
    await this.servico.redefinirSenha(id, dto.novaSenha, autor.id);
  }
}
