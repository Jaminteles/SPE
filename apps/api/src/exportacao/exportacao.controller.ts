import { Controller, Get, Param, ParseUUIDPipe, Query, Res, StreamableFile } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { PerfilCodigo } from '@prisma/client';
import { Response } from 'express';

import { Perfis } from '../auth/decorators/perfis.decorator';
import { TokenDaRequisicao } from '../auth/decorators/token-da-requisicao.decorator';
import { UsuarioAtual } from '../auth/decorators/usuario-atual.decorator';
import { UsuarioAutenticado } from '../auth/tipos';
import { UsuariosService } from '../usuarios/usuarios.service';
import { ExportacaoDto } from './dto/exportacao.dto';
import { ExportacaoService } from './exportacao.service';
import { ArquivoExportado, FormatoDeExportacao } from './tipos';

/**
 * Exportar é caro: gera arquivo e, no PDF, sobe um navegador. O padrão é
 * restritivo; homologação e teste ajustam por ambiente — é botão de operação,
 * não segredo.
 */
const JANELA_MS = Number(process.env.EXPORTACAO_THROTTLE_TTL_MS ?? 60_000);
const LIMITE_POR_JANELA = Number(process.env.EXPORTACAO_THROTTLE_LIMITE ?? 6);

/**
 * Exportação do resultado apurado.
 *
 * Aberta aos dois perfis autenticados — o Analista existe para ler resultado —,
 * e nenhuma rota daqui dá acesso a administração: o formato vem da rota, o
 * recorte da query e a identidade do token. Todo arquivo gerado vira registro
 * de auditoria com usuário, data e hora.
 *
 * O que sai é sempre agregado. Resposta individual não tem caminho de saída.
 */
@ApiTags('exportacao')
@ApiBearerAuth()
@Perfis(PerfilCodigo.ADMINISTRADOR, PerfilCodigo.ANALISTA)
@Throttle({ default: { limit: LIMITE_POR_JANELA, ttl: JANELA_MS } })
@Controller('exportacao')
export class ExportacaoController {
  constructor(
    private readonly servico: ExportacaoService,
    private readonly usuarios: UsuariosService,
  ) {}

  @Get(':formularioId/csv')
  @ApiOperation({ summary: 'Exporta o resultado do recorte em CSV.' })
  @ApiOkResponse({ description: 'Arquivo CSV.' })
  async csv(
    @Param('formularioId', ParseUUIDPipe) formularioId: string,
    @Query() filtro: ExportacaoDto,
    @UsuarioAtual() autor: UsuarioAutenticado,
    @Res({ passthrough: true }) resposta: Response,
  ): Promise<StreamableFile> {
    return this.entregar('csv', formularioId, filtro, autor, '', resposta);
  }

  @Get(':formularioId/xlsx')
  @ApiOperation({ summary: 'Exporta o resultado do recorte em XLSX.' })
  @ApiOkResponse({ description: 'Planilha XLSX.' })
  async xlsx(
    @Param('formularioId', ParseUUIDPipe) formularioId: string,
    @Query() filtro: ExportacaoDto,
    @UsuarioAtual() autor: UsuarioAutenticado,
    @Res({ passthrough: true }) resposta: Response,
  ): Promise<StreamableFile> {
    return this.entregar('xlsx', formularioId, filtro, autor, '', resposta);
  }

  @Get(':formularioId/pdf')
  @ApiOperation({ summary: 'Exporta o painel do recorte em PDF, com gráficos e tabelas.' })
  @ApiOkResponse({ description: 'Documento PDF.' })
  async pdf(
    @Param('formularioId', ParseUUIDPipe) formularioId: string,
    @Query() filtro: ExportacaoDto,
    @UsuarioAtual() autor: UsuarioAutenticado,
    @TokenDaRequisicao() token: string,
    @Res({ passthrough: true }) resposta: Response,
  ): Promise<StreamableFile> {
    return this.entregar('pdf', formularioId, filtro, autor, token, resposta);
  }

  private async entregar(
    formato: FormatoDeExportacao,
    formularioId: string,
    filtro: ExportacaoDto,
    autor: UsuarioAutenticado,
    token: string,
    resposta: Response,
  ): Promise<StreamableFile> {
    const usuario = await this.usuarios.buscar(autor.id);
    const arquivo = await this.servico.exportar(
      formato,
      formularioId,
      filtro,
      { id: autor.id, nome: usuario.nome },
      token,
    );

    return this.responder(arquivo, resposta);
  }

  /** O nome do arquivo já vem sanitizado do serviço; aqui ele só é entregue. */
  private responder(arquivo: ArquivoExportado, resposta: Response): StreamableFile {
    resposta.setHeader('Content-Type', arquivo.tipo);
    resposta.setHeader('Content-Disposition', `attachment; filename="${arquivo.nome}"`);
    resposta.setHeader('Cache-Control', 'no-store');
    return new StreamableFile(arquivo.conteudo);
  }
}
