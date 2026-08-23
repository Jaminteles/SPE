import { Module } from '@nestjs/common';

import { FormulariosController } from './formularios.controller';
import { FormulariosRepository } from './formularios.repository';
import { FormulariosService } from './formularios.service';
import { ProvedorQrCode } from './qrcode.provider';

@Module({
  controllers: [FormulariosController],
  providers: [FormulariosService, FormulariosRepository, ProvedorQrCode],
  exports: [FormulariosService, FormulariosRepository],
})
export class FormulariosModule {}
