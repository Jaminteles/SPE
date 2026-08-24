import { Module } from '@nestjs/common';

import { ExpurgoModule } from '../expurgo/expurgo.module';
import { FormulariosController } from './formularios.controller';
import { FormulariosRepository } from './formularios.repository';
import { FormulariosService } from './formularios.service';
import { ProvedorQrCode } from './qrcode.provider';

@Module({
  imports: [ExpurgoModule],
  controllers: [FormulariosController],
  providers: [FormulariosService, FormulariosRepository, ProvedorQrCode],
  exports: [FormulariosService, FormulariosRepository],
})
export class FormulariosModule {}
