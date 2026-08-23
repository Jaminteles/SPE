import { Module } from '@nestjs/common';

import { FormulariosController } from './formularios.controller';
import { FormulariosRepository } from './formularios.repository';
import { FormulariosService } from './formularios.service';

@Module({
  controllers: [FormulariosController],
  providers: [FormulariosService, FormulariosRepository],
  exports: [FormulariosService, FormulariosRepository],
})
export class FormulariosModule {}
