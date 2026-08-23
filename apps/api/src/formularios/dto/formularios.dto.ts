import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FormularioStatus, PerguntaTipo } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDate,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';

const paraTexto = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

const paraData = ({ value }: { value: unknown }) =>
  value === undefined || value === null || value === '' ? undefined : new Date(String(value));

const paraNumero = ({ value }: { value: unknown }) =>
  value === undefined || value === '' ? undefined : Number(value);

// ---------------------------------------------------------------------------
// Formulário
// ---------------------------------------------------------------------------

export class CriarFormularioDto {
  @ApiProperty({ maxLength: 180 })
  @IsString()
  @Transform(paraTexto)
  @Length(3, 180)
  titulo!: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @Transform(paraTexto)
  @Length(0, 2000)
  descricao?: string;

  @ApiPropertyOptional({ description: 'Início da vigência (ISO 8601).' })
  @IsOptional()
  @Transform(paraData)
  @IsDate()
  vigenciaInicio?: Date;

  @ApiPropertyOptional({ description: 'Fim da vigência (ISO 8601).' })
  @IsOptional()
  @Transform(paraData)
  @IsDate()
  vigenciaFim?: Date;
}

/** Sem `status`: mudança de status tem rota e regra próprias. */
export class AtualizarFormularioDto extends CriarFormularioDto {
  @ApiPropertyOptional({ maxLength: 180 })
  @IsOptional()
  @IsString()
  @Transform(paraTexto)
  @Length(3, 180)
  declare titulo: string;
}

export class ListarFormulariosDto {
  @ApiPropertyOptional({ enum: FormularioStatus })
  @IsOptional()
  @IsEnum(FormularioStatus)
  status?: FormularioStatus;

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

// ---------------------------------------------------------------------------
// Pergunta
// ---------------------------------------------------------------------------

export class CriarPerguntaDto {
  @ApiProperty({ maxLength: 500 })
  @IsString()
  @Transform(paraTexto)
  @Length(3, 500)
  enunciado!: string;

  @ApiProperty({ enum: PerguntaTipo })
  @IsEnum(PerguntaTipo)
  tipo!: PerguntaTipo;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  obrigatoria?: boolean;

  @ApiPropertyOptional({ description: 'Só para ESCALA.', minimum: 0, maximum: 10 })
  @IsOptional()
  @Transform(paraNumero)
  @IsInt()
  @Min(0)
  @Max(10)
  escalaMinimo?: number;

  @ApiPropertyOptional({ description: 'Só para ESCALA.', minimum: 1, maximum: 10 })
  @IsOptional()
  @Transform(paraNumero)
  @IsInt()
  @Min(1)
  @Max(10)
  escalaMaximo?: number;

  @ApiPropertyOptional({ maxLength: 60 })
  @IsOptional()
  @IsString()
  @Transform(paraTexto)
  @Length(1, 60)
  escalaRotuloMinimo?: string;

  @ApiPropertyOptional({ maxLength: 60 })
  @IsOptional()
  @IsString()
  @Transform(paraTexto)
  @Length(1, 60)
  escalaRotuloMaximo?: string;
}

/** O tipo não muda depois de criado: mudar tipo é criar outra pergunta. */
export class AtualizarPerguntaDto {
  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @Transform(paraTexto)
  @Length(3, 500)
  enunciado?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  obrigatoria?: boolean;

  @ApiPropertyOptional({ minimum: 0, maximum: 10 })
  @IsOptional()
  @Transform(paraNumero)
  @IsInt()
  @Min(0)
  @Max(10)
  escalaMinimo?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 10 })
  @IsOptional()
  @Transform(paraNumero)
  @IsInt()
  @Min(1)
  @Max(10)
  escalaMaximo?: number;

  @ApiPropertyOptional({ maxLength: 60 })
  @IsOptional()
  @IsString()
  @Transform(paraTexto)
  @Length(1, 60)
  escalaRotuloMinimo?: string;

  @ApiPropertyOptional({ maxLength: 60 })
  @IsOptional()
  @IsString()
  @Transform(paraTexto)
  @Length(1, 60)
  escalaRotuloMaximo?: string;
}

// ---------------------------------------------------------------------------
// Alternativa
// ---------------------------------------------------------------------------

export class CriarAlternativaDto {
  @ApiProperty({ maxLength: 300 })
  @IsString()
  @Transform(paraTexto)
  @Length(1, 300)
  texto!: string;
}

export class AtualizarAlternativaDto extends CriarAlternativaDto {}

// ---------------------------------------------------------------------------
// Ordenação
// ---------------------------------------------------------------------------

/** A nova ordem é a posição de cada id na lista. Precisa conter todos os itens. */
export class ReordenarDto {
  @ApiProperty({ type: [String], description: 'Ids na ordem desejada.' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  @Type(() => String)
  ids!: string[];
}

// ---------------------------------------------------------------------------
// Respostas da API
// ---------------------------------------------------------------------------

export class AlternativaResponse {
  @ApiProperty() id!: string;
  @ApiProperty() texto!: string;
  @ApiProperty() ordem!: number;
}

export class PerguntaResponse {
  @ApiProperty() id!: string;
  @ApiProperty() enunciado!: string;
  @ApiProperty({ enum: PerguntaTipo }) tipo!: PerguntaTipo;
  @ApiProperty() obrigatoria!: boolean;
  @ApiProperty() ordem!: number;
  @ApiProperty({ nullable: true }) escalaMinimo!: number | null;
  @ApiProperty({ nullable: true }) escalaMaximo!: number | null;
  @ApiProperty({ nullable: true }) escalaRotuloMinimo!: string | null;
  @ApiProperty({ nullable: true }) escalaRotuloMaximo!: string | null;
  @ApiProperty({ type: [AlternativaResponse] }) alternativas!: AlternativaResponse[];
}

export class FormularioResumoResponse {
  @ApiProperty() id!: string;
  @ApiProperty() titulo!: string;
  @ApiProperty({ nullable: true }) descricao!: string | null;
  @ApiProperty({ enum: FormularioStatus }) status!: FormularioStatus;
  @ApiProperty() versao!: number;
  @ApiProperty({ nullable: true }) vigenciaInicio!: Date | null;
  @ApiProperty({ nullable: true }) vigenciaFim!: Date | null;
  @ApiProperty({ nullable: true }) publicadoEm!: Date | null;
  @ApiProperty({ nullable: true }) encerradoEm!: Date | null;
  @ApiProperty() criadoEm!: Date;
  @ApiProperty({ description: 'Quantidade de perguntas.' }) totalPerguntas!: number;
}

export class FormularioResponse extends FormularioResumoResponse {
  @ApiProperty({ type: [PerguntaResponse] }) perguntas!: PerguntaResponse[];
}

export class ListaFormulariosResponse {
  @ApiProperty({ type: [FormularioResumoResponse] }) itens!: FormularioResumoResponse[];
  @ApiProperty() total!: number;
}
