import 'reflect-metadata';
import { config as loadDotenv } from 'dotenv';
loadDotenv();

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { createLogger, PinoLoggerService } from './common/logger';
import { loadConfig } from './infra/config/env';
import { setupOpenApi } from './openapi';

async function bootstrap(): Promise<void> {
  const config = loadConfig();
  const isDev = config.NODE_ENV === 'development';
  const logger = new PinoLoggerService(createLogger(config.LOG_LEVEL, isDev));

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger,
    bufferLogs: true,
  });

  configureApp(app, config);

  app.enableShutdownHooks();

  setupOpenApi(app);

  await app.listen(config.PORT, '0.0.0.0');
  Logger.log(`NOSION API พร้อมใช้งานที่ http://localhost:${config.PORT}/api/v1`, 'Bootstrap');
}

void bootstrap();
