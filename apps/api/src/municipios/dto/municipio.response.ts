import { ApiProperty } from '@nestjs/swagger';

/** Projeção pública do município: só o que a coleta e a apuração precisam. */
export class MunicipioResponse {
  @ApiProperty({ example: 2927408, description: 'Código do município no IBGE.' })
  codigoIbge!: number;

  @ApiProperty({ example: 'Salvador' })
  nome!: string;

  @ApiProperty({ example: 'BA' })
  uf!: string;
}

export class ListaMunicipiosResponse {
  @ApiProperty({ type: [MunicipioResponse] })
  itens!: MunicipioResponse[];

  @ApiProperty({ example: 417 })
  total!: number;
}
