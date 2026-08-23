import { Module } from '@nestjs/common';

import { AgregacaoController } from './agregacao.controller';
import { AgregacaoRepository } from './agregacao.repository';
import { AgregacaoService } from './agregacao.service';

@Module({
  controllers: [AgregacaoController],
  providers: [AgregacaoService, AgregacaoRepository],
  exports: [AgregacaoService, AgregacaoRepository],
})
export class AgregacaoModule {}
