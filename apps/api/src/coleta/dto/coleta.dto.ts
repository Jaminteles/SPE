import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PerguntaTipo, RespostaOrigem, RespostaStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  Equals,
  IsArray,
  IsBoolean,
  IsDate,
  IsEnum,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

const paraTexto = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

const paraData = ({ value }: { value: unknown }) =>
  value === undefined || value === null || value === '' ? undefined : new Date(String(value));

// ---------------------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------------------

/**
 * Item de resposta. Exatamente um dos campos de valor é preenchido; qual deles
 * depende do tipo da pergunta, conferido no serviço contra o formulário.
 */
export class ItemDeRespostaDto {
  @ApiProperty()
  @IsUUID('4')
  perguntaId!: string;

  @ApiPropertyOptional({ description: 'Escolha única e múltipla escolha.' })
  @IsOptional()
  @IsUUID('4')
  alternativaId?: string;

  @ApiPropertyOptional({ description: 'Texto livre.', maxLength: 1000 })
  @IsOptional()
  @IsString()
  @Transform(paraTexto)
  @Length(1, 1000)
  valorTexto?: string;

  @ApiPropertyOptional({ description: 'Número e escala.' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(-1_000_000_000)
  @Max(1_000_000_000)
  valorNumero?: number;
}

/**
 * Envio de resposta. Nenhum campo identifica o respondente: não há nome,
 * documento, telefone nem e-mail — e nenhum deles seria aceito, porque a
 * validação recusa campo não declarado.
 */
export class EnviarRespostaDto {
  @ApiProperty({
    description: 'Identificador da resposta, gerado no aparelho. Torna o reenvio idempotente.',
  })
  @IsUUID('4')
  respostaId!: string;

  @ApiProperty({ description: 'Aceite do termo de consentimento. Sem true, nada é gravado.' })
  @IsBoolean()
  @Equals(true, { message: 'É preciso aceitar o termo de consentimento.' })
  consentimento!: boolean;

  @ApiProperty({
    description: 'Token da sessão de preenchimento, devolvido na abertura da pesquisa.',
  })
  @IsString()
  @Length(20, 100)
  sessao!: string;

  @ApiPropertyOptional({
    description: 'Token do desafio anti-robô (Cloudflare Turnstile), quando exigido.',
  })
  @IsOptional()
  @IsString()
  @Length(1, 4000)
  desafioAntiRobo?: string;

  @ApiProperty({ description: 'Momento do aceite (ISO 8601).' })
  @Transform(paraData)
  @IsDate()
  consentimentoEm!: Date;

  @ApiProperty({ description: 'Município do respondente, por código IBGE.', example: 2927408 })
  @Type(() => Number)
  @IsInt()
  @Min(1_000_000)
  @Max(9_999_999)
  municipioCodigoIbge!: number;

  @ApiProperty({
    description:
      'Identificador aleatório do aparelho, gerado na instalação. O servidor guarda apenas o hash.',
    minLength: 16,
    maxLength: 100,
  })
  @IsString()
  @Length(16, 100)
  dispositivoId!: string;

  @ApiProperty({ description: 'Momento em que o preenchimento terminou (ISO 8601).' })
  @Transform(paraData)
  @IsDate()
  coletadoEm!: Date;

  @ApiPropertyOptional({ description: 'Opcional, só com permissão explícita. Uso de conferência.' })
  @IsOptional()
  @IsLatitude()
  latitude?: number;

  @ApiPropertyOptional({ description: 'Opcional, só com permissão explícita. Uso de conferência.' })
  @IsOptional()
  @IsLongitude()
  longitude?: number;

  @ApiPropertyOptional({
    enum: RespostaOrigem,
    default: RespostaOrigem.APLICATIVO,
    description: 'De onde veio a resposta. Não identifica o respondente.',
  })
  @IsOptional()
  @IsEnum(RespostaOrigem)
  origem?: RespostaOrigem;

  @ApiProperty({ type: [ItemDeRespostaDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(300)
  @ValidateNested({ each: true })
  @Type(() => ItemDeRespostaDto)
  itens!: ItemDeRespostaDto[];
}

// ---------------------------------------------------------------------------
// Saída
// ---------------------------------------------------------------------------

export class AlternativaPublicaResponse {
  @ApiProperty() id!: string;
  @ApiProperty() texto!: string;
  @ApiProperty() ordem!: number;
}

export class PerguntaPublicaResponse {
  @ApiProperty() id!: string;
  @ApiProperty() enunciado!: string;
  @ApiProperty({ enum: PerguntaTipo }) tipo!: PerguntaTipo;
  @ApiProperty() obrigatoria!: boolean;
  @ApiProperty() ordem!: number;
  @ApiProperty({ nullable: true }) escalaMinimo!: number | null;
  @ApiProperty({ nullable: true }) escalaMaximo!: number | null;
  @ApiProperty({ nullable: true }) escalaRotuloMinimo!: string | null;
  @ApiProperty({ nullable: true }) escalaRotuloMaximo!: string | null;
  @ApiProperty({ nullable: true }) condicaoAlternativaId!: string | null;
  @ApiProperty({ nullable: true }) condicaoPerguntaId!: string | null;
  @ApiProperty({ type: [AlternativaPublicaResponse] })
  alternativas!: AlternativaPublicaResponse[];
}

/** Só o que a tela de coleta precisa. Nada de autor, status interno ou contagem. */
export class FormularioPublicoResponse {
  @ApiProperty() titulo!: string;
  @ApiProperty({ nullable: true }) descricao!: string | null;
  @ApiProperty({ description: 'Token público do link. É por ele que a resposta é enviada.' })
  token!: string;

  @ApiProperty({
    description:
      'Token da sessão de preenchimento. Marca o início do preenchimento e é de uso único.',
  })
  sessao!: string;

  @ApiProperty({ description: 'Momento em que a sessão expira (ISO 8601).' })
  sessaoExpiraEm!: Date;

  @ApiProperty({ description: 'Se a origem precisa resolver o desafio anti-robô.' })
  exigeDesafioAntiRobo!: boolean;

  @ApiProperty({ type: [PerguntaPublicaResponse] })
  perguntas!: PerguntaPublicaResponse[];
}

export class RespostaRegistradaResponse {
  @ApiProperty({ description: 'Protocolo do envio. Não identifica quem respondeu.' })
  protocolo!: string;

  @ApiProperty({ enum: RespostaStatus })
  status!: RespostaStatus;

  @ApiProperty({ enum: RespostaOrigem })
  origem!: RespostaOrigem;

  @ApiProperty()
  recebidoEm!: Date;
}
