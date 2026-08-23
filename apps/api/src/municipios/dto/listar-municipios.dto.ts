import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Length, Matches, Max, Min } from 'class-validator';

/**
 * Entrada da consulta pública de municípios.
 * Validação estrita: rota pública não aceita campo não declarado.
 */
export class ListarMunicipiosDto {
  @ApiPropertyOptional({
    description: 'Trecho do nome do município.',
    minLength: 2,
    maxLength: 60,
  })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @Length(2, 60)
  @Matches(/^[\p{L}\p{M}\s'.-]+$/u, {
    message: 'nome aceita apenas letras, espaço, apóstrofo, ponto e hífen.',
  })
  nome?: string;

  @ApiPropertyOptional({ description: 'Quantidade de registros por página.', default: 50 })
  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === '' ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  @Max(500)
  limite?: number;

  @ApiPropertyOptional({ description: 'Registros a pular.', default: 0 })
  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === '' ? undefined : Number(value)))
  @IsInt()
  @Min(0)
  deslocamento?: number;
}
