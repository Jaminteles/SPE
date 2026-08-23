import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PerfilCodigo } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const paraTexto = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

const paraBooleano = ({ value }: { value: unknown }) => {
  if (value === 'true' || value === true) return true;
  if (value === 'false' || value === false) return false;
  return value;
};

export class CriarUsuarioDto {
  @ApiProperty({ maxLength: 120 })
  @IsString()
  @Transform(paraTexto)
  @Length(3, 120)
  nome!: string;

  @ApiProperty({ maxLength: 180 })
  @IsEmail({}, { message: 'e-mail inválido.' })
  @MaxLength(180)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email!: string;

  @ApiProperty({ minLength: 12, maxLength: 200 })
  @IsString()
  @Length(12, 200)
  senha!: string;

  @ApiProperty({ enum: PerfilCodigo })
  @IsEnum(PerfilCodigo)
  perfil!: PerfilCodigo;
}

/** Sem `perfil` e sem `senha`: cada um tem rota própria e auditoria própria. */
export class AtualizarUsuarioDto {
  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @Transform(paraTexto)
  @Length(3, 120)
  nome?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(paraBooleano)
  @IsBoolean()
  ativo?: boolean;
}

export class AlterarPerfilDto {
  @ApiProperty({ enum: PerfilCodigo })
  @IsEnum(PerfilCodigo)
  perfil!: PerfilCodigo;
}

export class RedefinirSenhaDto {
  @ApiProperty({ minLength: 12, maxLength: 200 })
  @IsString()
  @Length(12, 200)
  novaSenha!: string;
}

export class TrocarSenhaDto extends RedefinirSenhaDto {
  @ApiProperty({ minLength: 12, maxLength: 200 })
  @IsString()
  @Length(12, 200)
  senhaAtual!: string;
}

export class ListarUsuariosDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(paraBooleano)
  @IsBoolean()
  ativo?: boolean;

  @ApiPropertyOptional({ enum: PerfilCodigo })
  @IsOptional()
  @IsEnum(PerfilCodigo)
  perfil?: PerfilCodigo;

  @ApiPropertyOptional({ default: 50 })
  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === '' ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  @Max(200)
  limite?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === '' ? undefined : Number(value)))
  @IsInt()
  @Min(0)
  deslocamento?: number;
}

export class UsuarioResponse {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  nome!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty()
  ativo!: boolean;

  @ApiProperty({ enum: PerfilCodigo })
  perfil!: PerfilCodigo;

  @ApiProperty({ nullable: true })
  ultimoLoginEm!: Date | null;

  @ApiProperty()
  criadoEm!: Date;
}

export class ListaUsuariosResponse {
  @ApiProperty({ type: [UsuarioResponse] })
  itens!: UsuarioResponse[];

  @ApiProperty()
  total!: number;
}
