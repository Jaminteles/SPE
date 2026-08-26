import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PerfilCodigo } from '@prisma/client';

import { DonoDoFormulario } from '../auth/decorators/dono-do-formulario.decorator';
import { Perfis } from '../auth/decorators/perfis.decorator';
import { UsuarioAtual } from '../auth/decorators/usuario-atual.decorator';
import { UsuarioAutenticado } from '../auth/tipos';
import {
  InvalidarRespostaDto,
  ListaRespostasResponse,
  ListarRespostasDto,
  RespostaParaConferenciaResponse,
  ResumoDeIntegridadeResponse,
  RevalidarRespostaDto,
} from './dto/respostas.dto';
import { RespostasService } from './respostas.service';

/**
 * Conferência de integridade — área do Administrador.
 *
 * A resposta é anônima: não há o que reidentificar aqui. Ainda assim, a
 * projeção não devolve o hash de dispositivo nem o conteúdo respondido —
 * quem confere integridade olha tempo, origem e marcação, não o voto.
 *
 * Invalidar **nunca** apaga: muda o status e o registro permanece no banco,
 * fora da contagem e com motivo, autor e data.
 */
@ApiTags('respostas')
@ApiBearerAuth()
@Perfis(PerfilCodigo.ADMINISTRADOR, PerfilCodigo.PESQUISADOR)
@DonoDoFormulario()
@Controller('formularios/:formularioId/respostas')
export class RespostasController {
  constructor(private readonly servico: RespostasService) {}

  @Get()
  @ApiOperation({ summary: 'Lista respostas para conferência.' })
  @ApiOkResponse({ type: ListaRespostasResponse })
  async listar(
    @Param('formularioId', ParseUUIDPipe) formularioId: string,
    @Query() filtro: ListarRespostasDto,
  ): Promise<ListaRespostasResponse> {
    return this.servico.listar(formularioId, filtro);
  }

  @Get('resumo')
  @ApiOperation({ summary: 'Contagem por status e por marcação automática.' })
  @ApiOkResponse({ type: ResumoDeIntegridadeResponse })
  async resumo(
    @Param('formularioId', ParseUUIDPipe) formularioId: string,
  ): Promise<ResumoDeIntegridadeResponse> {
    return this.servico.resumo(formularioId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe de uma resposta para conferência.' })
  @ApiOkResponse({ type: RespostaParaConferenciaResponse })
  async buscar(
    @Param('formularioId', ParseUUIDPipe) formularioId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<RespostaParaConferenciaResponse> {
    return this.servico.buscar(formularioId, id);
  }

  @Post(':id/invalidar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Retira a resposta da contagem, sem apagá-la.' })
  @ApiOkResponse({ type: RespostaParaConferenciaResponse })
  async invalidar(
    @UsuarioAtual() autor: UsuarioAutenticado,
    @Param('formularioId', ParseUUIDPipe) formularioId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: InvalidarRespostaDto,
  ): Promise<RespostaParaConferenciaResponse> {
    return this.servico.invalidar(formularioId, id, dto.motivo, autor.id);
  }

  @Post(':id/revalidar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Devolve a resposta para a contagem.' })
  @ApiOkResponse({ type: RespostaParaConferenciaResponse })
  async revalidar(
    @UsuarioAtual() autor: UsuarioAutenticado,
    @Param('formularioId', ParseUUIDPipe) formularioId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RevalidarRespostaDto,
  ): Promise<RespostaParaConferenciaResponse> {
    return this.servico.revalidar(formularioId, id, dto.motivo, autor.id);
  }
}
