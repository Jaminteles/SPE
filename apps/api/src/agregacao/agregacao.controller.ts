import { Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PerfilCodigo } from '@prisma/client';

import { Perfis } from '../auth/decorators/perfis.decorator';
import { UsuarioAtual } from '../auth/decorators/usuario-atual.decorator';
import { UsuarioAutenticado } from '../auth/tipos';
import { AgregacaoService } from './agregacao.service';

/**
 * Atualizacao das agregacoes sob demanda. O caminho normal e o job periodico;
 * esta rota existe para o Administrador forcar o recalculo depois de invalidar
 * respostas em lote, sem esperar o proximo ciclo.
 */
@ApiTags('agregacao')
@ApiBearerAuth()
@Perfis(PerfilCodigo.ADMINISTRADOR)
@Controller('agregacao')
export class AgregacaoController {
  constructor(private readonly servico: AgregacaoService) {}

  @Post('atualizar')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Solicita a atualizacao das agregacoes pre-calculadas.' })
  @ApiOkResponse({ description: 'Atualizacao enfileirada ou executada.' })
  async atualizar(
    @UsuarioAtual() autor: UsuarioAutenticado,
  ): Promise<{ situacao: 'enfileirada' | 'executada' }> {
    return { situacao: await this.servico.solicitarAtualizacao(autor.id) };
  }
}
