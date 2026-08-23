import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';

import { AppModule } from './app.module';
import { TodasExcecoesFilter } from './common/filters/todas-excecoes.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService);

  app.use(helmet());
  app.enableShutdownHooks();

  const origens = config.get<string[]>('CORS_ORIGINS', []);
  app.enableCors({
    origin: origens.length > 0 ? origens : false,
    credentials: true,
  });

  const prefixo = config.get<string>('API_PREFIX', 'api');
  app.setGlobalPrefix(prefixo);

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
        .setVersion('0.1.0')
        .addBearerAuth()
        .build(),
    );
    SwaggerModule.setup(`${prefixo}/docs`, app, documento);
  }

  const porta = config.get<number>('PORT', 3000);
  await app.listen(porta);
  new Logger('Bootstrap').log(`API disponível em http://localhost:${porta}/${prefixo}`);
}

void bootstrap();
