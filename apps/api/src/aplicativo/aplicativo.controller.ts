import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Publico } from '../auth/decorators/publico.decorator';
import { AplicativoService } from './aplicativo.service';
import { VersaoDoAplicativoResponse } from './dto/aplicativo.dto';

/**
 * Rota pública: o aplicativo consulta a versão **antes** de qualquer login, e a
 * página de download é aberta por quem ainda não tem conta nenhuma.
 *
 * Pública não é desprotegida: vale o rate limit global, a resposta é constante
 * e não recebe entrada nenhuma — não há o que injetar nem o que enumerar.
 */
@Publico()
@ApiTags('aplicativo')
@Controller('aplicativo')
export class AplicativoController {
  constructor(private readonly servico: AplicativoService) {}

  @Get('versao')
  @ApiOperation({ summary: 'Versão publicada do APK, hash do arquivo e link de download.' })
  @ApiOkResponse({ type: VersaoDoAplicativoResponse })
  versao(): VersaoDoAplicativoResponse {
    return this.servico.versao();
  }
}
