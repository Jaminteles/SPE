import { Module } from '@nestjs/common';

import { ResultadosController } from './resultados.controller';
import { ResultadosRepository } from './resultados.repository';
import { ResultadosService } from './resultados.service';

@Module({
  controllers: [ResultadosController],
  providers: [ResultadosService, ResultadosRepository],
  exports: [ResultadosService],
})
export class ResultadosModule {}
