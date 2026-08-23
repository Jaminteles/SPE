import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RespostaMarcacao, RespostaOrigem, RespostaStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

const paraNumero = ({ value }: { value: unknown }) =>
  value === undefined || value === '' ? undefined : Number(value);

/** O formulário vem da rota, não do corpo nem da query. */
export class ListarRespostasDto {
  @ApiPropertyOptional({ enum: RespostaStatus })
  @IsOptional()
  @IsEnum(RespostaStatus)
  status?: RespostaStatus;

  @ApiPropertyOptional({ enum: RespostaMarcacao })
  @IsOptional()
  @IsEnum(RespostaMarcacao)
  marcacao?: RespostaMarcacao;

  @ApiPropertyOptional({ description: 'Município por código IBGE.' })
  @IsOptional()
  @Transform(paraNumero)
  @IsInt()
  @Min(1_000_000)
  @Max(9_999_999)
  municipioCodigoIbge?: number;

  @ApiPropertyOptional({ default: 50 })
  @IsOptional()
  @Transform(paraNumero)
  @IsInt()
  @Min(1)
  @Max(200)
  limite?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Transform(paraNumero)
  @IsInt()
  @Min(0)
  deslocamento?: number;
}

export class InvalidarRespostaDto {
  @ApiProperty({ description: 'Por que a resposta sai da contagem.', maxLength: 240 })
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @Length(5, 240)
  motivo!: string;
}

export class RevalidarRespostaDto {
  @ApiProperty({ description: 'Por que a resposta volta para a contagem.', maxLength: 240 })
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @Length(5, 240)
  motivo!: string;
}

/**
 * Projeção de conferência. Não traz `dispositivoHash` nem os itens da resposta:
 * o Administrador confere integridade, não lê o voto de ninguém.
 */
export class RespostaParaConferenciaResponse {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: RespostaStatus }) status!: RespostaStatus;
  @ApiProperty({ enum: RespostaOrigem }) origem!: RespostaOrigem;
  @ApiProperty() municipioCodigoIbge!: number;
  @ApiProperty() municipioNome!: string;
  @ApiProperty() iniciadoEm!: Date;
  @ApiProperty() coletadoEm!: Date;
  @ApiProperty() recebidoEm!: Date;
  @ApiProperty() duracaoSegundos!: number;
  @ApiProperty({ enum: RespostaMarcacao, isArray: true }) marcacoes!: RespostaMarcacao[];
  @ApiProperty({ nullable: true }) motivoConferencia!: string | null;
  @ApiProperty({ nullable: true }) motivoInvalidacao!: string | null;
  @ApiProperty({ nullable: true }) invalidadaEm!: Date | null;

  @ApiProperty({ description: 'Se o respondente autorizou registrar a localização.' })
  temGeolocalizacao!: boolean;

  @ApiProperty({ nullable: true, description: 'Só para conferência.' })
  latitude!: number | null;

  @ApiProperty({ nullable: true, description: 'Só para conferência.' })
  longitude!: number | null;
}

export class ListaRespostasResponse {
  @ApiProperty({ type: [RespostaParaConferenciaResponse] })
  itens!: RespostaParaConferenciaResponse[];

  @ApiProperty() total!: number;
}

export class ResumoDeIntegridadeResponse {
  @ApiProperty() validas!: number;
  @ApiProperty() emConferencia!: number;
  @ApiProperty() invalidadas!: number;
  @ApiProperty({ description: 'Contagem por marcação automática.' })
  porMarcacao!: Record<string, number>;
}
