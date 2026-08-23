import { Module } from '@nestjs/common';

import { ColetaController } from './coleta.controller';
import { ColetaRepository } from './coleta.repository';
import { ColetaService } from './coleta.service';
import { AnaliseDeSuspeitaService } from './analise-de-suspeita.service';
import { DispositivoService } from './dispositivo.service';
import { SessaoColetaService } from './sessao-coleta.service';
import { ProvedorAntiRobo } from './turnstile.provider';

@Module({
  controllers: [ColetaController],
  providers: [
    ColetaService,
    ColetaRepository,
    DispositivoService,
    SessaoColetaService,
    ProvedorAntiRobo,
    AnaliseDeSuspeitaService,
  ],
  exports: [ColetaService],
})
export class ColetaModule {}
