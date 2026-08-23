import { ApiProperty } from '@nestjs/swagger';
import { PerfilCodigo } from '@prisma/client';

export class TokenResponse {
  @ApiProperty()
  accessToken!: string;

  @ApiProperty({ description: 'Usado apenas para renovar a sessao. Guardar em area segura.' })
  refreshToken!: string;

  @ApiProperty({ example: 900 })
  expiraEmSegundos!: number;

  @ApiProperty({ enum: PerfilCodigo })
  perfil!: PerfilCodigo;
}

export class UsuarioLogadoResponse {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  nome!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty({ enum: PerfilCodigo })
  perfil!: PerfilCodigo;
}
