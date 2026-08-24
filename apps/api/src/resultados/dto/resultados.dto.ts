import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FormularioStatus, PerguntaTipo } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsDate, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

const paraNumero = ({ value }: { value: unknown }) =>
  value === undefined || value === '' ? undefined : Number(value);

const paraData = ({ value }: { value: unknown }) =>
  value === undefined || value === null || value === '' ? undefined : new Date(String(value));

/**
 * Filtros do painel. Os quatro se combinam: formulário (na rota), pergunta,
 * município e período. Nenhum deles é opcional por acaso — sem filtro, o
 * recorte é a pesquisa inteira.
 */
export class FiltroDeResultadoDto {
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

// ---------------------------------------------------------------------------
// Saída
// ---------------------------------------------------------------------------

export class FormularioComResultadoResponse {
  @ApiProperty() id!: string;
  @ApiProperty() titulo!: string;
  @ApiProperty({ enum: FormularioStatus }) status!: FormularioStatus;
  @ApiProperty() versao!: number;
  @ApiProperty({ nullable: true }) publicadoEm!: Date | null;
  @ApiProperty({ nullable: true }) encerradoEm!: Date | null;
  @ApiProperty() respostasValidas!: number;
}

export class IndicadoresResponse {
  @ApiProperty({ description: 'Respostas válidas no recorte pedido.' })
  respostasValidas!: number;

  @ApiProperty({ description: 'Respostas em conferência na pesquisa inteira.' })
  respostasEmConferencia!: number;

  @ApiProperty({ description: 'Respostas invalidadas na pesquisa inteira.' })
  respostasInvalidadas!: number;

  @ApiProperty({ description: 'Municípios com ao menos uma resposta válida.' })
  municipiosAlcancados!: number;

  @ApiProperty({ description: 'Total de municípios da Bahia.' })
  municipiosDaBahia!: number;

  @ApiProperty({ nullable: true }) primeiraRespostaEm!: Date | null;
  @ApiProperty({ nullable: true }) ultimaRespostaEm!: Date | null;

  @ApiProperty({ description: 'Momento em que a agregação foi atualizada.' })
  atualizadoEm!: Date;
}

export class AlternativaComResultadoResponse {
  @ApiProperty() alternativaId!: string;
  @ApiProperty() texto!: string;
  @ApiProperty() ordem!: number;
  @ApiProperty() total!: number;
  @ApiProperty({ description: 'Percentual sobre as respostas válidas da pergunta no recorte.' })
  percentual!: number;
}

export class PerguntaComResultadoResponse {
  @ApiProperty() perguntaId!: string;
  @ApiProperty() enunciado!: string;
  @ApiProperty({ enum: PerguntaTipo }) tipo!: PerguntaTipo;
  @ApiProperty() ordem!: number;
  @ApiProperty({ description: 'Respostas válidas nesta pergunta, no recorte.' })
  totalDeRespostas!: number;
  @ApiProperty({ type: [AlternativaComResultadoResponse] })
  alternativas!: AlternativaComResultadoResponse[];
}

export class ResultadoPorPerguntaResponse {
  @ApiProperty({ type: [PerguntaComResultadoResponse] })
  perguntas!: PerguntaComResultadoResponse[];
}

export class PontoDaEvolucaoResponse {
  @ApiProperty({ description: 'Dia (AAAA-MM-DD), no fuso da Bahia.' })
  dia!: string;
  @ApiProperty() respostasValidas!: number;
  @ApiProperty({ description: 'Acumulado até o dia.' }) acumulado!: number;
}

export class EvolucaoResponse {
  @ApiProperty({ type: [PontoDaEvolucaoResponse] })
  pontos!: PontoDaEvolucaoResponse[];
}

export class MunicipioComResultadoResponse {
  @ApiProperty() codigoIbge!: number;
  @ApiProperty() nome!: string;
  @ApiProperty() respostasValidas!: number;
}

export class AlcancePorMunicipioResponse {
  @ApiProperty({ type: [MunicipioComResultadoResponse] })
  municipios!: MunicipioComResultadoResponse[];
}

// ---------------------------------------------------------------------------
// Cruzamento entre perguntas
// ---------------------------------------------------------------------------

/**
 * Recorte do cruzamento. Duas perguntas distintas e, opcionalmente, um
 * município. Período fica de fora: a view de cruzamento não tem a dimensão de
 * dia — cruzamento é leitura de composição, não de série temporal.
 */
export class CruzamentoDto {
  @ApiProperty({ description: 'Pergunta das linhas.' })
  @IsUUID('4')
  perguntaAId!: string;

  @ApiProperty({ description: 'Pergunta das colunas.' })
  @IsUUID('4')
  perguntaBId!: string;

  @ApiPropertyOptional({ description: 'Restringe a um município, por código IBGE.' })
  @IsOptional()
  @Transform(paraNumero)
  @IsInt()
  @Min(1_000_000)
  @Max(9_999_999)
  municipioCodigoIbge?: number;
}

export class CelulaDoCruzamentoResponse {
  @ApiProperty() alternativaId!: string;
  @ApiProperty() texto!: string;
  @ApiProperty() total!: number;
  @ApiProperty({ description: 'Percentual sobre o total da linha.' })
  percentual!: number;
}

export class LinhaDoCruzamentoResponse {
  @ApiProperty() alternativaId!: string;
  @ApiProperty() texto!: string;
  @ApiProperty({ description: 'Respostas válidas que caem nesta linha, no recorte.' })
  total!: number;
  @ApiProperty({ type: [CelulaDoCruzamentoResponse] })
  celulas!: CelulaDoCruzamentoResponse[];
}

export class PerguntaDoCruzamentoResponse {
  @ApiProperty() perguntaId!: string;
  @ApiProperty() enunciado!: string;
}

export class AlternativaDoCruzamentoResponse {
  @ApiProperty() alternativaId!: string;
  @ApiProperty() texto!: string;
}

export class CruzamentoResponse {
  @ApiProperty({ type: PerguntaDoCruzamentoResponse, description: 'Pergunta das linhas.' })
  perguntaLinhas!: PerguntaDoCruzamentoResponse;

  @ApiProperty({ type: PerguntaDoCruzamentoResponse, description: 'Pergunta das colunas.' })
  perguntaColunas!: PerguntaDoCruzamentoResponse;

  @ApiProperty({ description: 'Respostas válidas presentes nas duas perguntas, no recorte.' })
  total!: number;

  @ApiProperty({ type: [AlternativaDoCruzamentoResponse], description: 'Cabeçalho das colunas.' })
  colunas!: AlternativaDoCruzamentoResponse[];

  @ApiProperty({ type: [LinhaDoCruzamentoResponse] })
  linhas!: LinhaDoCruzamentoResponse[];
}

// ---------------------------------------------------------------------------
// Cobertura
// ---------------------------------------------------------------------------

export class CoberturaResponse {
  @ApiProperty({ description: 'Total de municípios da Bahia.' })
  municipiosDaBahia!: number;
  @ApiProperty({ description: 'Municípios com ao menos uma resposta válida.' })
  alcancados!: number;
  @ApiProperty({ description: 'Percentual de cobertura sobre os municípios da Bahia.' })
  percentualDeCobertura!: number;
  @ApiProperty({
    type: [MunicipioComResultadoResponse],
    description: 'Todos os municípios da Bahia, com zero para os não alcançados.',
  })
  municipios!: MunicipioComResultadoResponse[];
}

export class MunicipioRanqueadoResponse {
  @ApiProperty() posicao!: number;
  @ApiProperty() codigoIbge!: number;
  @ApiProperty() nome!: string;
  @ApiProperty() respostasValidas!: number;
  @ApiProperty({ description: 'Percentual sobre as respostas válidas do recorte.' })
  percentual!: number;
}

export class RankingPorMunicipioResponse {
  @ApiProperty({ description: 'Respostas válidas no recorte — base dos percentuais.' })
  total!: number;
  @ApiProperty({ type: [MunicipioRanqueadoResponse] })
  municipios!: MunicipioRanqueadoResponse[];
}
