import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { AgregacaoModule } from './agregacao/agregacao.module';
import { AplicativoModule } from './aplicativo/aplicativo.module';
import { AuditoriaModule } from './auditoria/auditoria.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { PerfisGuard } from './auth/guards/perfis.guard';
import { ColetaModule } from './coleta/coleta.module';
import { validarAmbiente } from './config/env.config';
import { ExportacaoModule } from './exportacao/exportacao.module';
import { ExpurgoModule } from './expurgo/expurgo.module';
import { FormulariosModule } from './formularios/formularios.module';
import { HealthModule } from './health/health.module';
import { MunicipiosModule } from './municipios/municipios.module';
import { PrismaModule } from './prisma/prisma.module';
import { RespostasModule } from './respostas/respostas.module';
import { ResultadosModule } from './resultados/resultados.module';
import { UsuariosModule } from './usuarios/usuarios.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validarAmbiente,
    }),
    // Rate limit vale para toda a API. A rota de coleta é pública e precisa dele.
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          ttl: config.get<number>('THROTTLE_TTL_MS', 60_000),
          limit: config.get<number>('THROTTLE_LIMIT', 60),
        },
      ],
    }),
    PrismaModule,
    AuditoriaModule,
    UsuariosModule,
    AuthModule,
    FormulariosModule,
    ColetaModule,
    RespostasModule,
    ResultadosModule,
    AgregacaoModule,
    ExportacaoModule,
    ExpurgoModule,
    HealthModule,
    MunicipiosModule,
    AplicativoModule,
  ],
  providers: [
    // A ordem importa: limite de requisições, depois identidade, depois permissão.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PerfisGuard },
  ],
})
export class AppModule {}
