import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

interface CorpoErro {
  statusCode: number;
  erro: string;
  mensagem: string | string[];
  caminho: string;
  timestamp: string;
}

/**
 * Tratamento centralizado de erro.
 *
 * Regras:
 * - Erro não previsto nunca vaza mensagem interna, stack ou detalhe do banco.
 * - O log registra apenas método, rota e status. Body e query ficam de fora:
 *   a rota de coleta carrega dado de resposta e hash de dispositivo.
 */
@Catch()
export class TodasExcecoesFilter implements ExceptionFilter {
  private readonly logger = new Logger('HTTP');

  catch(excecao: unknown, host: ArgumentsHost): void {
    const contexto = host.switchToHttp();
    const resposta = contexto.getResponse<Response>();
    const requisicao = contexto.getRequest<Request>();

    const ehHttp = excecao instanceof HttpException;
    const status = ehHttp ? excecao.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    const corpo: CorpoErro = {
      statusCode: status,
      erro: HttpStatus[status] ?? 'ERRO',
      mensagem: ehHttp ? this.extrairMensagem(excecao) : 'Erro interno.',
      caminho: requisicao.url.split('?')[0],
      timestamp: new Date().toISOString(),
    };

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${requisicao.method} ${corpo.caminho} ${status}`,
        excecao instanceof Error ? excecao.stack : undefined,
      );
    } else {
      this.logger.warn(`${requisicao.method} ${corpo.caminho} ${status}`);
    }

    resposta.status(status).json(corpo);
  }

  private extrairMensagem(excecao: HttpException): string | string[] {
    const resposta = excecao.getResponse();
    if (typeof resposta === 'string') {
      return resposta;
    }
    const objeto = resposta as { message?: string | string[] };
    return objeto.message ?? excecao.message;
  }
}
