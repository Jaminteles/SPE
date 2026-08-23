import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { toString as qrParaTexto } from 'qrcode';

/**
 * Geração do QR Code do link de coleta, atrás de um adapter.
 *
 * A biblioteca fica isolada aqui: trocar de implementação não toca o serviço.
 * É processamento local, sem rede e sem credencial — nada trafega para fora.
 */
@Injectable()
export class ProvedorQrCode {
  private readonly logger = new Logger(ProvedorQrCode.name);

  /** Correção de erro média: sobra tolerância para cartaz impresso e amassado. */
  private static readonly NIVEL_CORRECAO = 'M' as const;
  private static readonly MARGEM = 2;
  private static readonly LARGURA = 320;

  async gerarSvg(conteudo: string): Promise<string> {
    try {
      return await qrParaTexto(conteudo, {
        type: 'svg',
        errorCorrectionLevel: ProvedorQrCode.NIVEL_CORRECAO,
        margin: ProvedorQrCode.MARGEM,
        width: ProvedorQrCode.LARGURA,
      });
    } catch (erro) {
      // O conteúdo é uma URL nossa; falhar aqui é defeito, não entrada inválida.
      this.logger.error(
        'Falha ao gerar QR Code do link de coleta.',
        erro instanceof Error ? erro.stack : undefined,
      );
      throw new InternalServerErrorException('Não foi possível gerar o QR Code.');
    }
  }
}
