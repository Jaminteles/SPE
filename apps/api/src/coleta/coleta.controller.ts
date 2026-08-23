import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { Publico } from '../auth/decorators/publico.decorator';
import { ColetaService } from './coleta.service';
import {
  EnviarRespostaDto,
  FormularioPublicoResponse,
  RespostaRegistradaResponse,
} from './dto/coleta.dto';
import { TokenDeColetaPipe } from './token-de-coleta.pipe';

/**
 * Limites da rota pública. O padrão é restritivo; homologação e teste ajustam
 * por ambiente. Não é segredo — é um botão de operação.
 */
const JANELA_MS = Number(process.env.COLETA_THROTTLE_TTL_MS ?? 60_000);
const LIMITE_ABERTURA = Number(process.env.COLETA_THROTTLE_LIMITE_ABERTURA ?? 30);
const LIMITE_ENVIO = Number(process.env.COLETA_THROTTLE_LIMITE_ENVIO ?? 10);

/**
 * Coleta pública. O respondente não tem conta — por isso a rota é aberta, e
 * por isso ela é a mais protegida do sistema:
 *
 * - rate limit próprio, mais apertado que o global;
 * - validação estrita (campo não declarado derruba a requisição);
 * - o formulário é identificado pelo token público, nunca pelo uuid interno;
 * - a resposta é anônima por construção: nenhum campo identifica quem respondeu.
 *
 * A verificação anti-robô (Cloudflare Turnstile) tem task própria e entra
 * antes do início da coleta real.
 */
@Publico()
@ApiTags('coleta')
@Controller('coleta')
export class ColetaController {
  constructor(private readonly servico: ColetaService) {}

  @Throttle({ default: { limit: LIMITE_ABERTURA, ttl: JANELA_MS } })
  @Get(':token')
  @ApiOperation({ summary: 'Abre o formulário pelo link público.' })
  @ApiOkResponse({ type: FormularioPublicoResponse })
  async abrir(
    @Param('token', TokenDeColetaPipe) token: string,
  ): Promise<FormularioPublicoResponse> {
    return this.servico.abrir(token);
  }

  @Throttle({ default: { limit: LIMITE_ENVIO, ttl: JANELA_MS } })
  @Post(':token/respostas')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Registra uma resposta.' })
  @ApiOkResponse({ type: RespostaRegistradaResponse })
  async enviar(
    @Param('token', TokenDeColetaPipe) token: string,
    @Body() dto: EnviarRespostaDto,
  ): Promise<RespostaRegistradaResponse> {
    const gravada = await this.servico.enviar(token, dto);

    // O protocolo é o id que o próprio aparelho gerou: serve para o respondente
    // conferir o envio e não diz nada sobre quem ele é.
    return {
      protocolo: gravada.id,
      status: gravada.status,
      origem: gravada.origem,
      recebidoEm: gravada.recebidoEm,
    };
  }
}
