import { ApiProperty } from '@nestjs/swagger';

export class SituacaoDoExpurgoResponse {
  @ApiProperty({ description: 'Respostas que já passaram do prazo de retenção.' })
  respostasVencidas!: number;

  @ApiProperty({ description: 'Respostas com prazo de expurgo carimbado.' })
  respostasComPrazo!: number;

  @ApiProperty({ description: 'Pesquisas encerradas ainda sem expurgo técnico.' })
  pesquisasComExpurgoTecnicoPendente!: number;

  @ApiProperty({
    description: 'Respostas que ainda guardam hash de dispositivo (coleta em andamento).',
  })
  dispositivosAindaGuardados!: number;
}
