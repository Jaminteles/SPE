import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PerfilCodigo } from '@prisma/client';

import { Perfis } from '../auth/decorators/perfis.decorator';
import {
  AlcancePorMunicipioResponse,
  EvolucaoResponse,
  FiltroDeResultadoDto,
  FormularioComResultadoResponse,
  IndicadoresResponse,
  ResultadoPorPerguntaResponse,
} from './dto/resultados.dto';
import { ResultadosService } from './resultados.service';

/**
 * Resultado da apuração — o que o painel consome.
 *
 * Aberto aos dois perfis autenticados: o Analista existe justamente para ler
 * resultado. Nenhuma rota daqui devolve resposta individual — só agregado —, e
 * nenhuma delas dá acesso a administração: trocar id na rota não muda o perfil
 * de quem pergunta.
 *
 * Toda consulta sai de view materializada. A tabela bruta não é varrida.
 */
@ApiTags('resultados')
@ApiBearerAuth()
@Perfis(PerfilCodigo.ADMINISTRADOR, PerfilCodigo.ANALISTA)
@Controller('resultados')
export class ResultadosController {
  constructor(private readonly servico: ResultadosService) {}

  @Get('formularios')
  @ApiOperation({ summary: 'Pesquisas com resultado disponível.' })
  @ApiOkResponse({ type: [FormularioComResultadoResponse] })
  async formularios(): Promise<FormularioComResultadoResponse[]> {
    return this.servico.formularios();
  }

  @Get(':formularioId/indicadores')
  @ApiOperation({ summary: 'Indicadores gerais do recorte.' })
  @ApiOkResponse({ type: IndicadoresResponse })
  async indicadores(
    @Param('formularioId', ParseUUIDPipe) formularioId: string,
    @Query() filtro: FiltroDeResultadoDto,
  ): Promise<IndicadoresResponse> {
    return this.servico.indicadores(formularioId, filtro);
  }

  @Get(':formularioId/perguntas')
  @ApiOperation({ summary: 'Resultado por pergunta e alternativa.' })
  @ApiOkResponse({ type: ResultadoPorPerguntaResponse })
  async porPergunta(
    @Param('formularioId', ParseUUIDPipe) formularioId: string,
    @Query() filtro: FiltroDeResultadoDto,
  ): Promise<ResultadoPorPerguntaResponse> {
    return this.servico.porPergunta(formularioId, filtro);
  }

  @Get(':formularioId/evolucao')
  @ApiOperation({ summary: 'Evolução diária da coleta.' })
  @ApiOkResponse({ type: EvolucaoResponse })
  async evolucao(
    @Param('formularioId', ParseUUIDPipe) formularioId: string,
    @Query() filtro: FiltroDeResultadoDto,
  ): Promise<EvolucaoResponse> {
    return this.servico.evolucao(formularioId, filtro);
  }

  @Get(':formularioId/municipios')
  @ApiOperation({ summary: 'Alcance por município, para o filtro e a cobertura.' })
  @ApiOkResponse({ type: AlcancePorMunicipioResponse })
  async municipios(
    @Param('formularioId', ParseUUIDPipe) formularioId: string,
  ): Promise<AlcancePorMunicipioResponse> {
    return this.servico.alcance(formularioId);
  }
}
