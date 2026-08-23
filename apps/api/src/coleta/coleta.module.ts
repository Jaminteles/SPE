import { Module } from '@nestjs/common';

import { ColetaController } from './coleta.controller';
import { ColetaRepository } from './coleta.repository';
import { ColetaService } from './coleta.service';
import { DispositivoService } from './dispositivo.service';

@Module({
  controllers: [ColetaController],
  providers: [ColetaService, ColetaRepository, DispositivoService],
  exports: [ColetaService],
})
export class ColetaModule {}
