import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsDate, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

const paraNumero = ({ value }: { value: unknown }) =>
  value === undefined || value === '' ? undefined : Number(value);

const paraData = ({ value }: { value: unknown }) =>
  value === undefined || value === null || value === '' ? undefined : new Date(String(value));

/**
 * Recorte da exportação — os mesmos filtros do painel, de propósito: o arquivo
 * exportado tem de bater com a tela que o pediu.
 */
export class ExportacaoDto {
  @ApiPropertyOptional({ description: 'Restringe a uma pergunta.' })
  @IsOptional()
  @IsUUID('4')
  perguntaId?: string;

  @ApiPropertyOptional({ description: 'Restringe a um município, por código IBGE.' })
  @IsOptional()
  @Transform(paraNumero)
  @IsInt()
  @Min(1_000_000)
  @Max(9_999_999)
  municipioCodigoIbge?: number;

  @ApiPropertyOptional({ description: 'Início do período (ISO 8601).' })
  @IsOptional()
  @Transform(paraData)
  @IsDate()
  de?: Date;

  @ApiPropertyOptional({ description: 'Fim do período (ISO 8601).' })
  @IsOptional()
  @Transform(paraData)
  @IsDate()
  ate?: Date;
}
