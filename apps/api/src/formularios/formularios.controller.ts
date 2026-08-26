import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
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
  AcessoResponse,
  AlternativaResponse,
  AtualizarAlternativaDto,
  AtualizarFormularioDto,
  AtualizarPerguntaDto,
  CriarAlternativaDto,
  CriarFormularioDto,
  CriarPerguntaDto,
  DuplicarFormularioDto,
  FormularioResponse,
  FormularioResumoResponse,
  ListaFormulariosResponse,
  ListarFormulariosDto,
  PerguntaResponse,
  ReordenarDto,
} from './dto/formularios.dto';
import { FormulariosService } from './formularios.service';

/**
 * Montagem do formulário — área do Administrador.
 *
 * Todas as rotas exigem perfil Administrador: o Analista recebe 403 em
 * qualquer uma delas, inclusive trocando ids na rota.
 *
 * Pergunta e alternativa vivem sob o formulário na própria URL. O id do pai
 * entra no WHERE da consulta, então pergunta de outro formulário responde 404
 * em vez de vazar existência.
 */
@ApiTags('formularios')
@ApiBearerAuth()
@Perfis(PerfilCodigo.ADMINISTRADOR, PerfilCodigo.PESQUISADOR)
@Controller('formularios')
export class FormulariosController {
  constructor(private readonly servico: FormulariosService) {}

  // ------------------------------------------------------------------ formulário

  @Get()
  @ApiOperation({ summary: 'Lista formulários.' })
  @ApiOkResponse({ type: ListaFormulariosResponse })
  async listar(
    @UsuarioAtual() requisitante: UsuarioAutenticado,
    @Query() filtro: ListarFormulariosDto,
  ): Promise<ListaFormulariosResponse> {
    return this.servico.listar(filtro, requisitante);
  }

  @DonoDoFormulario('id')
  @Get(':id')
  @ApiOperation({ summary: 'Recupera o formulário com perguntas e alternativas.' })
  @ApiOkResponse({ type: FormularioResponse })
  async buscar(@Param('id', ParseUUIDPipe) id: string): Promise<FormularioResponse> {
    return this.servico.buscar(id);
  }

  @Post()
  @ApiOperation({ summary: 'Cria formulário em rascunho.' })
  @ApiOkResponse({ type: FormularioResumoResponse })
  async criar(
    @UsuarioAtual() autor: UsuarioAutenticado,
    @Body() dto: CriarFormularioDto,
  ): Promise<FormularioResumoResponse> {
    return this.servico.criar(dto, autor.id);
  }

  @DonoDoFormulario('id')
  @Patch(':id')
  @ApiOperation({ summary: 'Altera o formulário (somente em rascunho).' })
  @ApiOkResponse({ type: FormularioResumoResponse })
  async atualizar(
    @UsuarioAtual() autor: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AtualizarFormularioDto,
  ): Promise<FormularioResumoResponse> {
    return this.servico.atualizar(id, dto, autor.id);
  }

  @DonoDoFormulario('id')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Exclui um rascunho que ainda não recebeu resposta.' })
  async excluir(
    @UsuarioAtual() autor: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.servico.excluir(id, autor.id);
  }

  @DonoDoFormulario('id')
  @Post(':id/publicar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Publica o formulário. A partir daqui o conteúdo é imutável.' })
  @ApiOkResponse({ type: FormularioResumoResponse })
  async publicar(
    @UsuarioAtual() autor: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<FormularioResumoResponse> {
    return this.servico.publicar(id, autor.id);
  }

  @DonoDoFormulario('id')
  @Get(':id/acesso')
  @ApiOperation({ summary: 'Link público e QR Code do formulário em coleta.' })
  @ApiOkResponse({ type: AcessoResponse })
  async acesso(@Param('id', ParseUUIDPipe) id: string): Promise<AcessoResponse> {
    return this.servico.acesso(id);
  }

  @DonoDoFormulario('id')
  @Post(':id/duplicar')
  @ApiOperation({ summary: 'Duplica o formulário como novo rascunho.' })
  @ApiOkResponse({ type: FormularioResumoResponse })
  async duplicar(
    @UsuarioAtual() autor: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DuplicarFormularioDto,
  ): Promise<FormularioResumoResponse> {
    return this.servico.duplicar(id, dto.titulo, autor.id);
  }

  @DonoDoFormulario('id')
  @Post(':id/encerrar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Encerra a coleta do formulário.' })
  @ApiOkResponse({ type: FormularioResumoResponse })
  async encerrar(
    @UsuarioAtual() autor: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<FormularioResumoResponse> {
    return this.servico.encerrar(id, autor.id);
  }

  // -------------------------------------------------------------------- pergunta

  @DonoDoFormulario('id')
  @Post(':id/perguntas')
  @ApiOperation({ summary: 'Acrescenta pergunta ao rascunho.' })
  @ApiOkResponse({ type: PerguntaResponse })
  async criarPergunta(
    @UsuarioAtual() autor: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CriarPerguntaDto,
  ): Promise<PerguntaResponse> {
    return this.servico.criarPergunta(id, dto, autor.id);
  }

  @DonoDoFormulario('id')
  @Patch(':id/perguntas/ordem')
  @ApiOperation({ summary: 'Reordena as perguntas do formulário.' })
  @ApiOkResponse({ type: [PerguntaResponse] })
  async reordenarPerguntas(
    @UsuarioAtual() autor: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReordenarDto,
  ): Promise<PerguntaResponse[]> {
    return this.servico.reordenarPerguntas(id, dto.ids, autor.id);
  }

  @DonoDoFormulario('id')
  @Patch(':id/perguntas/:perguntaId')
  @ApiOperation({ summary: 'Altera enunciado, obrigatoriedade ou escala da pergunta.' })
  @ApiOkResponse({ type: PerguntaResponse })
  async atualizarPergunta(
    @UsuarioAtual() autor: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('perguntaId', ParseUUIDPipe) perguntaId: string,
    @Body() dto: AtualizarPerguntaDto,
  ): Promise<PerguntaResponse> {
    return this.servico.atualizarPergunta(id, perguntaId, dto, autor.id);
  }

  @DonoDoFormulario('id')
  @Delete(':id/perguntas/:perguntaId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a pergunta do rascunho.' })
  async excluirPergunta(
    @UsuarioAtual() autor: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('perguntaId', ParseUUIDPipe) perguntaId: string,
  ): Promise<void> {
    await this.servico.excluirPergunta(id, perguntaId, autor.id);
  }

  // ----------------------------------------------------------------- alternativa

  @DonoDoFormulario('id')
  @Post(':id/perguntas/:perguntaId/alternativas')
  @ApiOperation({ summary: 'Acrescenta alternativa à pergunta de escolha.' })
  @ApiOkResponse({ type: AlternativaResponse })
  async criarAlternativa(
    @UsuarioAtual() autor: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('perguntaId', ParseUUIDPipe) perguntaId: string,
    @Body() dto: CriarAlternativaDto,
  ): Promise<AlternativaResponse> {
    return this.servico.criarAlternativa(id, perguntaId, dto, autor.id);
  }

  @DonoDoFormulario('id')
  @Patch(':id/perguntas/:perguntaId/alternativas/ordem')
  @ApiOperation({ summary: 'Reordena as alternativas da pergunta.' })
  @ApiOkResponse({ type: [AlternativaResponse] })
  async reordenarAlternativas(
    @UsuarioAtual() autor: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('perguntaId', ParseUUIDPipe) perguntaId: string,
    @Body() dto: ReordenarDto,
  ): Promise<AlternativaResponse[]> {
    return this.servico.reordenarAlternativas(id, perguntaId, dto.ids, autor.id);
  }

  @DonoDoFormulario('id')
  @Patch(':id/perguntas/:perguntaId/alternativas/:alternativaId')
  @ApiOperation({ summary: 'Altera o texto da alternativa.' })
  @ApiOkResponse({ type: AlternativaResponse })
  async atualizarAlternativa(
    @UsuarioAtual() autor: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('perguntaId', ParseUUIDPipe) perguntaId: string,
    @Param('alternativaId', ParseUUIDPipe) alternativaId: string,
    @Body() dto: AtualizarAlternativaDto,
  ): Promise<AlternativaResponse> {
    return this.servico.atualizarAlternativa(id, perguntaId, alternativaId, dto, autor.id);
  }

  @DonoDoFormulario('id')
  @Delete(':id/perguntas/:perguntaId/alternativas/:alternativaId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a alternativa.' })
  async excluirAlternativa(
    @UsuarioAtual() autor: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('perguntaId', ParseUUIDPipe) perguntaId: string,
    @Param('alternativaId', ParseUUIDPipe) alternativaId: string,
  ): Promise<void> {
    await this.servico.excluirAlternativa(id, perguntaId, alternativaId, autor.id);
  }
}
