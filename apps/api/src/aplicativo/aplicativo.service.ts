import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { VersaoDoAplicativoResponse } from './dto/aplicativo.dto';

/**
 * Distribuição do aplicativo.
 *
 * O APK é entregue direto, sem loja — então a verificação de versão na abertura
 * é o que substitui a atualização automática que a loja faria. A fonte da
 * verdade é o ambiente do servidor: publicar uma versão nova é trocar variável
 * e reiniciar, não recompilar a API.
 */
@Injectable()
export class AplicativoService {
  constructor(private readonly config: ConfigService) {}

  versao(): VersaoDoAplicativoResponse {
    return {
      versaoAtual: this.config.get<string>('APP_VERSAO_ATUAL', '0.1.0'),
      versaoMinima: this.config.get<string>('APP_VERSAO_MINIMA', '0.1.0'),
      urlDownload: this.config.get<string>('APP_URL_DOWNLOAD', ''),
      urlArquivo: this.config.get<string>('APP_URL_APK') || null,
      sha256: this.config.get<string>('APP_APK_SHA256') || null,
      notas: this.config.get<string>('APP_NOTAS_DA_VERSAO') || null,
    };
  }
}
