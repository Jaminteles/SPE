import { Module } from '@nestjs/common';

import { RespostasController } from './respostas.controller';
import { RespostasRepository } from './respostas.repository';
import { RespostasService } from './respostas.service';

@Module({
  controllers: [RespostasController],
  providers: [RespostasService, RespostasRepository],
  exports: [RespostasService],
})
export class RespostasModule {}
