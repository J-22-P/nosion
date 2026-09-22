import 'reflect-metadata';
import { config as loadDotenv } from 'dotenv';
loadDotenv();

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { createLogger, PinoLoggerService } from './common/logger';
import { loadConfig } from './infra/config/env';

async function bootstrap(): Promise<void> {
  const config = loadConfig();
  const isDev = config.NODE_ENV === 'development';
  const logger = new PinoLoggerService(createLogger(config.LOG_LEVEL, isDev));

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger,
    bufferLogs: true,
  });

  app.setGlobalPrefix('api/v1', { exclude: ['healthz', 'readyz', 'metrics'] });
  app.use(helmet({ contentSecurityPolicy: !isDev }));
  app.use(cookieParser());
  app.getHttpAdapter().getInstance().disable('x-powered-by');

  // จำกัดขนาด body ที่ 1 MB (สเปกหัวข้อ 9.3) — upload ใช้ presigned URL ไม่ผ่าน API
  app.useBodyParser('json', { limit: '1mb' });
  app.useBodyParser('urlencoded', { limit: '1mb', extended: true });

  app.enableCors({
    origin: config.CORS_ORIGINS,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  });

  app.enableShutdownHooks();

  if (config.NODE_ENV !== 'production') {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('NOSION API')
        .setDescription('Personal productivity OS — REST API')
        .setVersion('1.0')
        .addBearerAuth()
        .build(),
    );
    SwaggerModule.setup('docs', app, document, { jsonDocumentUrl: 'openapi.json' });
  }

  await app.listen(config.PORT, '0.0.0.0');
  Logger.log(`NOSION API พร้อมใช้งานที่ http://localhost:${config.PORT}/api/v1`, 'Bootstrap');
}

void bootstrap();
