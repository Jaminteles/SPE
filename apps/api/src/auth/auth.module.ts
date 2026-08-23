import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import { AuditoriaModule } from '../auditoria/auditoria.module';
import { UsuariosModule } from '../usuarios/usuarios.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SenhaService } from './senha.service';
import { SessaoService } from './sessao.service';

@Global()
@Module({
  imports: [
    AuditoriaModule,
    UsuariosModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        // O segredo vem só do ambiente; a validação de subida recusa segredo curto.
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: { algorithm: 'HS256', issuer: 'spe-api' },
        verifyOptions: { algorithms: ['HS256'], issuer: 'spe-api' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, SenhaService, SessaoService],
  exports: [AuthService, SenhaService, SessaoService, JwtModule],
})
export class AuthModule {}
