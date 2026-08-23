import { Global, Module } from '@nestjs/common';

import { AuditoriaController } from './auditoria.controller';
import { AuditoriaRepository } from './auditoria.repository';
import { AuditoriaService } from './auditoria.service';

@Global()
@Module({
  controllers: [AuditoriaController],
  providers: [AuditoriaService, AuditoriaRepository],
  exports: [AuditoriaService],
})
export class AuditoriaModule {}
