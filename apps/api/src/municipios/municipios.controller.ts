import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Publico } from '../auth/decorators/publico.decorator';
import { ListarMunicipiosDto } from './dto/listar-municipios.dto';
import { ListaMunicipiosResponse, MunicipioResponse } from './dto/municipio.response';
import { MunicipiosService } from './municipios.service';

/**
 * Rota pública: a tela de coleta precisa da lista antes de qualquer autenticação.
 * Pública não é desprotegida — vale o rate limit global e a validação estrita de entrada.
 * Só dado de referência do IBGE trafega aqui; nada de resposta ou de respondente.
 */
@Publico()
@ApiTags('municipios')
@Controller('municipios')
export class MunicipiosController {
  constructor(private readonly servico: MunicipiosService) {}

  @Get()
  @ApiOperation({ summary: 'Lista os municípios da Bahia (base oficial do IBGE).' })
  @ApiOkResponse({ type: ListaMunicipiosResponse })
  async listar(@Query() filtro: ListarMunicipiosDto): Promise<ListaMunicipiosResponse> {
    return this.servico.listar(filtro);
  }

  @Get(':codigoIbge')
  @ApiOperation({ summary: 'Consulta um município pelo código IBGE.' })
  @ApiOkResponse({ type: MunicipioResponse })
  async buscar(@Param('codigoIbge', ParseIntPipe) codigoIbge: number): Promise<MunicipioResponse> {
    return this.servico.buscarPorCodigoIbge(codigoIbge);
  }
}
