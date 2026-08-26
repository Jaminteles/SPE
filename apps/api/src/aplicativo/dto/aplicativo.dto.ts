import { ApiProperty } from '@nestjs/swagger';

/**
 * Informação de distribuição do APK.
 *
 * Tudo aqui é público por natureza — é o que a página de download e o próprio
 * aplicativo precisam saber para conferir se estão atualizados. Nenhum dado de
 * respondente, nenhum segredo: só versão, link e hash do arquivo.
 */
export class VersaoDoAplicativoResponse {
  @ApiProperty({ description: 'Versão publicada do APK (semver).', example: '1.0.0' })
  versaoAtual!: string;

  @ApiProperty({
    description: 'Versão mínima aceita. Abaixo disso o app bloqueia e exige atualização.',
    example: '1.0.0',
  })
  versaoMinima!: string;

  @ApiProperty({ description: 'Endereço da página de download, com o passo a passo.' })
  urlDownload!: string;

  @ApiProperty({ description: 'Endereço do arquivo APK publicado.', nullable: true })
  urlArquivo!: string | null;

  @ApiProperty({
    description: 'SHA-256 do APK publicado, para conferência antes de instalar.',
    nullable: true,
  })
  sha256!: string | null;

  @ApiProperty({ description: 'O que mudou nesta versão.', nullable: true })
  notas!: string | null;

  @ApiProperty({
    description:
      'Se esta instalação aceita auto-cadastro. O aplicativo usa isto para decidir se ' +
      'oferece "Registrar-se" — botão que sempre falha é pior que botão ausente.',
  })
  cadastroAberto!: boolean;
}
