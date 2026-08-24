import { Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PerfilCodigo } from '@prisma/client';

import { Perfis } from '../auth/decorators/perfis.decorator';
import { SituacaoDoExpurgoResponse } from './dto/expurgo.dto';
import { ExpurgoService } from './expurgo.service';

/**
 * Acompanhamento do expurgo.
 *
 * O caminho normal é o job periódico; estas rotas existem para o Administrador
 * conferir o que está pendente e para validar a rotina em homologação sem
 * esperar o próximo ciclo. Nenhuma delas escolhe *o que* apagar: o prazo é do
 * dado, não de quem clica.
 *
 * Só Administrador — o Analista lê resultado, não opera retenção.
 */
@ApiTags('expurgo')
@ApiBearerAuth()
@Perfis(PerfilCodigo.ADMINISTRADOR)
@Controller('expurgo')
export class ExpurgoController {
  constructor(private readonly servico: ExpurgoService) {}

  @Get('situacao')
  @ApiOperation({ summary: 'O que está pendente de expurgo.' })
  @ApiOkResponse({ type: SituacaoDoExpurgoResponse })
  async situacao(): Promise<SituacaoDoExpurgoResponse> {
    return this.servico.situacao();
  }

  @Post('executar')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Solicita a execução da rotina de expurgo.' })
  @ApiOkResponse({ description: 'Execução enfileirada ou executada.' })
  async executar(): Promise<{ situacao: 'enfileirada' | 'executada' }> {
    return { situacao: await this.servico.solicitarExecucao() };
  }
}
