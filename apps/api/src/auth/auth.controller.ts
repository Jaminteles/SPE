import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { UsuariosRepository } from '../usuarios/usuarios.repository';
import { AuthService } from './auth.service';
import { Publico } from './decorators/publico.decorator';
import { UsuarioAtual } from './decorators/usuario-atual.decorator';
import { LoginDto } from './dto/login.dto';
import { RenovarDto } from './dto/renovar.dto';
import { TokenResponse, UsuarioLogadoResponse } from './dto/token.response';
import { UsuarioAutenticado } from './tipos';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly usuarios: UsuariosRepository,
  ) {}

  /** Rate limit próprio, bem mais apertado que o global: login é alvo de força bruta. */
  @Publico()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Autentica usuário do painel ou da administração.' })
  @ApiOkResponse({ type: TokenResponse })
  async login(@Body() dto: LoginDto): Promise<TokenResponse> {
    return this.auth.login(dto.email, dto.senha);
  }

  @Publico()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('renovar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Renova o access token e rotaciona o refresh token.' })
  @ApiOkResponse({ type: TokenResponse })
  async renovar(@Body() dto: RenovarDto): Promise<TokenResponse> {
    return this.auth.renovar(dto.refreshToken);
  }

  @ApiBearerAuth()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Encerra a sessão atual.' })
  async logout(@UsuarioAtual() usuario: UsuarioAutenticado): Promise<void> {
    // A sessão encerrada é sempre a do token apresentado: ninguém desloga terceiros por aqui.
    await this.auth.logout(usuario.id, usuario.sessaoId);
  }

  @ApiBearerAuth()
  @Get('eu')
  @ApiOperation({ summary: 'Dados do usuário autenticado.' })
  @ApiOkResponse({ type: UsuarioLogadoResponse })
  async eu(@UsuarioAtual() usuario: UsuarioAutenticado): Promise<UsuarioLogadoResponse> {
    const registro = await this.usuarios.buscarPorId(usuario.id);
    if (!registro) {
      throw new NotFoundException('Usuário não encontrado.');
    }
    return {
      id: registro.id,
      nome: registro.nome,
      email: registro.email,
      perfil: registro.perfil,
    };
  }
}
