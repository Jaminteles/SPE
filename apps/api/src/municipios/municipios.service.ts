import { Injectable, NotFoundException } from '@nestjs/common';

import { ListarMunicipiosDto } from './dto/listar-municipios.dto';
import { ListaMunicipiosResponse, MunicipioResponse } from './dto/municipio.response';
import { MunicipiosRepository } from './municipios.repository';

const LIMITE_PADRAO = 50;
const DESLOCAMENTO_PADRAO = 0;

@Injectable()
export class MunicipiosService {
  constructor(private readonly repositorio: MunicipiosRepository) {}

  async listar(filtro: ListarMunicipiosDto): Promise<ListaMunicipiosResponse> {
    return this.repositorio.listar({
      nome: filtro.nome,
      limite: filtro.limite ?? LIMITE_PADRAO,
      deslocamento: filtro.deslocamento ?? DESLOCAMENTO_PADRAO,
    });
  }

  async buscarPorCodigoIbge(codigoIbge: number): Promise<MunicipioResponse> {
    const municipio = await this.repositorio.buscarPorCodigoIbge(codigoIbge);
    if (!municipio) {
      throw new NotFoundException('Município não encontrado na base do IBGE.');
    }
    return municipio;
  }
}
