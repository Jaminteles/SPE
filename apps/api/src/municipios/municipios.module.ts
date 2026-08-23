import { Module } from '@nestjs/common';

import { MunicipiosController } from './municipios.controller';
import { MunicipiosRepository } from './municipios.repository';
import { MunicipiosService } from './municipios.service';

@Module({
  controllers: [MunicipiosController],
  providers: [MunicipiosService, MunicipiosRepository],
  exports: [MunicipiosService],
})
export class MunicipiosModule {}
