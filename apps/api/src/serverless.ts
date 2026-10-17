import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { createLogger, PinoLoggerService } from './common/logger';
import { loadConfig } from './infra/config/env';
import { setupOpenApi } from './openapi';

/**
 * ทางเข้าสำหรับ Vercel Function (staging) — ไม่มี app.listen
 * Vercel เรียก handler ทีละคำขอ · สร้างแอป Nest ครั้งเดียวต่อ instance แล้วเก็บไว้ (warm start ไม่ต้อง bootstrap ใหม่)
 * ตั้งค่า HTTP ชุดเดียวกับ main.ts ผ่าน configureApp()
 */
type Handler = (req: IncomingMessage, res: ServerResponse) => void;

let ready: Promise<Handler> | null = null;

async function createHandler(): Promise<Handler> {
  const config = loadConfig();
  const logger = new PinoLoggerService(createLogger(config.LOG_LEVEL, false));
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger,
    bufferLogs: true,
  });
  configureApp(app, config);
  setupOpenApi(app);
  await app.init();
  return app.getHttpAdapter().getInstance() as Handler;
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  // bootstrap ล้ม (เช่น env ผิด) → ล้าง cache ให้คำขอถัดไปลองใหม่ แทนที่จะพังค้างทั้ง instance
  ready ??= createHandler().catch((err: unknown) => {
    ready = null;
    throw err;
  });
  const app = await ready;
  app(req, res);
}
