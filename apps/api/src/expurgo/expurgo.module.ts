import { Module } from '@nestjs/common';

import { AuditoriaModule } from '../auditoria/auditoria.module';
import { ExpurgoController } from './expurgo.controller';
import { ExpurgoRepository } from './expurgo.repository';
import { ExpurgoService } from './expurgo.service';

@Module({
  imports: [AuditoriaModule],
  controllers: [ExpurgoController],
  providers: [ExpurgoService, ExpurgoRepository],
  exports: [ExpurgoService],
})
export class ExpurgoModule {}
