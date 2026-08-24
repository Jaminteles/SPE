import { Module } from '@nestjs/common';

import { AplicativoController } from './aplicativo.controller';
import { AplicativoService } from './aplicativo.service';

@Module({
  controllers: [AplicativoController],
  providers: [AplicativoService],
  exports: [AplicativoService],
})
export class AplicativoModule {}
