import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PerfilCodigo } from '@prisma/client';

import { DonoDoFormulario } from '../auth/decorators/dono-do-formulario.decorator';
import { Perfis } from '../auth/decorators/perfis.decorator';
import { UsuarioAtual } from '../auth/decorators/usuario-atual.decorator';
import { UsuarioAutenticado } from '../auth/tipos';
import {
  AlcancePorMunicipioResponse,
  CoberturaResponse,
  CruzamentoDto,
  CruzamentoResponse,
  EvolucaoResponse,
  FiltroDeResultadoDto,
  FormularioComResultadoResponse,
  IndicadoresResponse,
  RankingPorMunicipioResponse,
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
@Perfis(PerfilCodigo.ADMINISTRADOR, PerfilCodigo.ANALISTA, PerfilCodigo.PESQUISADOR)
@Controller('resultados')
export class ResultadosController {
  constructor(private readonly servico: ResultadosService) {}

  @Get('formularios')
  @ApiOperation({ summary: 'Pesquisas com resultado disponível.' })
  @ApiOkResponse({ type: [FormularioComResultadoResponse] })
  async formularios(
    @UsuarioAtual() requisitante: UsuarioAutenticado,
  ): Promise<FormularioComResultadoResponse[]> {
    return this.servico.formularios(requisitante);
  }

  @DonoDoFormulario()
  @Get(':formularioId/indicadores')
  @ApiOperation({ summary: 'Indicadores gerais do recorte.' })
  @ApiOkResponse({ type: IndicadoresResponse })
  async indicadores(
    @Param('formularioId', ParseUUIDPipe) formularioId: string,
    @Query() filtro: FiltroDeResultadoDto,
  ): Promise<IndicadoresResponse> {
    return this.servico.indicadores(formularioId, filtro);
  }

  @DonoDoFormulario()
  @Get(':formularioId/perguntas')
  @ApiOperation({ summary: 'Resultado por pergunta e alternativa.' })
  @ApiOkResponse({ type: ResultadoPorPerguntaResponse })
  async porPergunta(
    @Param('formularioId', ParseUUIDPipe) formularioId: string,
    @Query() filtro: FiltroDeResultadoDto,
  ): Promise<ResultadoPorPerguntaResponse> {
    return this.servico.porPergunta(formularioId, filtro);
  }

  @DonoDoFormulario()
  @Get(':formularioId/evolucao')
  @ApiOperation({ summary: 'Evolução diária da coleta.' })
  @ApiOkResponse({ type: EvolucaoResponse })
  async evolucao(
    @Param('formularioId', ParseUUIDPipe) formularioId: string,
    @Query() filtro: FiltroDeResultadoDto,
  ): Promise<EvolucaoResponse> {
    return this.servico.evolucao(formularioId, filtro);
  }

  @DonoDoFormulario()
  @Get(':formularioId/ranking-municipios')
  @ApiOperation({ summary: 'Ranking por município, com absolutos e percentuais.' })
  @ApiOkResponse({ type: RankingPorMunicipioResponse })
  async ranking(
    @Param('formularioId', ParseUUIDPipe) formularioId: string,
    @Query() filtro: FiltroDeResultadoDto,
  ): Promise<RankingPorMunicipioResponse> {
    return this.servico.ranking(formularioId, filtro);
  }

  @DonoDoFormulario()
  @Get(':formularioId/cobertura')
  @ApiOperation({ summary: 'Cobertura: municípios alcançados e não alcançados.' })
  @ApiOkResponse({ type: CoberturaResponse })
  async cobertura(
    @Param('formularioId', ParseUUIDPipe) formularioId: string,
  ): Promise<CoberturaResponse> {
    return this.servico.cobertura(formularioId);
  }

  @DonoDoFormulario()
  @Get(':formularioId/cruzamento')
  @ApiOperation({ summary: 'Cruzamento entre duas perguntas do mesmo formulário.' })
  @ApiOkResponse({ type: CruzamentoResponse })
  async cruzamento(
    @Param('formularioId', ParseUUIDPipe) formularioId: string,
    @Query() filtro: CruzamentoDto,
  ): Promise<CruzamentoResponse> {
    return this.servico.cruzamento(formularioId, filtro);
  }

  @DonoDoFormulario()
  @Get(':formularioId/municipios')
  @ApiOperation({ summary: 'Alcance por município, para o filtro e a cobertura.' })
  @ApiOkResponse({ type: AlcancePorMunicipioResponse })
  async municipios(
    @Param('formularioId', ParseUUIDPipe) formularioId: string,
  ): Promise<AlcancePorMunicipioResponse> {
    return this.servico.alcance(formularioId);
  }
}
