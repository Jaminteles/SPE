import { Logger, ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';

import { AppModule } from './app.module';
import { TodasExcecoesFilter } from './common/filters/todas-excecoes.filter';
import { ExigirHttpsMiddleware } from './common/middlewares/exigir-https.middleware';

/** Versão corrente da API. Toda rota nasce sob /api/v1. */
export const VERSAO_PADRAO = '1';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService);

  // O TLS termina no proxy; sem confiar nele, req.protocol e o IP do rate limit ficam errados.
  app.set('trust proxy', 1);

  app.use(
    helmet({
      hsts: { maxAge: 31_536_000, includeSubDomains: true, preload: false },
      contentSecurityPolicy: false,
      // A API é consumida por painel e aplicativo, que em desenvolvimento vivem
      // em outra origem. Quem autoriza a leitura é o CORS, com allowlist.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(new ExigirHttpsMiddleware(config.get<boolean>('TLS_OBRIGATORIO', false)).uso);
  app.enableShutdownHooks();

  const origens = config.get<string[]>('CORS_ORIGINS', []);
  app.enableCors({
    origin: origens.length > 0 ? origens : false,
    credentials: true,
  });

  const prefixo = config.get<string>('API_PREFIX', 'api');
  app.setGlobalPrefix(prefixo);
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: VERSAO_PADRAO });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );
  app.useGlobalFilters(new TodasExcecoesFilter());

  if (config.get<string>('NODE_ENV') !== 'production') {
    const documento = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('API — Sistema de Pesquisa Eleitoral')
        .setDescription('Coleta anônima, apuração por município (código IBGE) e painel.')
        .setVersion('1.0.0')
        .addBearerAuth()
        .build(),
    );
    SwaggerModule.setup(`${prefixo}/docs`, app, documento);
  }

  const porta = config.get<number>('PORT', 3000);
  await app.listen(porta);
  new Logger('Bootstrap').log(
    `API disponível em http://localhost:${porta}/${prefixo}/v${VERSAO_PADRAO}`,
  );
}

void bootstrap();
