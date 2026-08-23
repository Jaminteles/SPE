import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiPropertyOptional,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';
import { AuditoriaAcao, PerfilCodigo, Prisma } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsDate, IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

import { Perfis } from '../auth/decorators/perfis.decorator';
import { AuditoriaRepository } from './auditoria.repository';

class ConsultarAuditoriaDto {
  @ApiPropertyOptional({ enum: AuditoriaAcao })
  @IsOptional()
  @IsEnum(AuditoriaAcao)
  acao?: AuditoriaAcao;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  usuarioId?: string;

  @ApiPropertyOptional({ description: 'Início do período (ISO 8601).' })
  @IsOptional()
  @Transform(({ value }) => (value ? new Date(String(value)) : undefined))
  @IsDate()
  de?: Date;

  @ApiPropertyOptional({ description: 'Fim do período (ISO 8601).' })
  @IsOptional()
  @Transform(({ value }) => (value ? new Date(String(value)) : undefined))
  @IsDate()
  ate?: Date;

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

class LogAuditoriaResponse {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: AuditoriaAcao })
  acao!: AuditoriaAcao;

  @ApiProperty()
  entidade!: string;

  @ApiProperty({ nullable: true })
  entidadeId!: string | null;

  @ApiProperty({ nullable: true })
  detalhe!: Prisma.JsonValue | null;

  @ApiProperty()
  criadoEm!: Date;

  @ApiProperty({ nullable: true })
  usuario!: { id: string; nome: string; email: string } | null;
}

class ListaAuditoriaResponse {
  @ApiProperty({ type: [LogAuditoriaResponse] })
  itens!: LogAuditoriaResponse[];

  @ApiProperty()
  total!: number;
}

/**
 * Consulta da trilha de auditoria. Restrita ao Administrador: o Analista
 * enxerga resultado agregado, não quem fez o quê.
 */
@ApiTags('auditoria')
@ApiBearerAuth()
@Perfis(PerfilCodigo.ADMINISTRADOR)
@Controller('auditoria')
export class AuditoriaController {
  constructor(private readonly repositorio: AuditoriaRepository) {}

  @Get()
  @ApiOperation({ summary: 'Consulta o log de auditoria.' })
  @ApiOkResponse({ type: ListaAuditoriaResponse })
  async listar(@Query() filtro: ConsultarAuditoriaDto): Promise<ListaAuditoriaResponse> {
    return this.repositorio.listar({
      acao: filtro.acao,
      usuarioId: filtro.usuarioId,
      de: filtro.de,
      ate: filtro.ate,
      limite: filtro.limite ?? 50,
      deslocamento: filtro.deslocamento ?? 0,
    });
  }
}
