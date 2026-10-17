import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { trustProxiedClientIp } from './common/client-ip';
import type { AppConfig } from './infra/config/env';

/**
 * ตั้งค่า HTTP ที่ทุกทางเข้าต้องเหมือนกัน — ใช้ทั้ง main.ts (server ปกติ) และ serverless.ts (Vercel)
 * ถ้าแยกเขียนสองที่ วันหนึ่ง staging จะมี CORS/ขนาด body ไม่ตรงกับ production โดยไม่มีใครรู้
 */
export function configureApp(app: NestExpressApplication, config: AppConfig): void {
  const isDev = config.NODE_ENV === 'development';
  const express = app.getHttpAdapter().getInstance();
  // IP จริงของผู้ใช้ (rate limit ต่อ IP) — ดู TRUST_PROXY ใน env.ts และ common/client-ip.ts
  express.set('trust proxy', config.TRUST_PROXY ?? (process.env.VERCEL ? 1 : 0));
  app.use(trustProxiedClientIp(config.API_PROXY_KEY));
  app.setGlobalPrefix('api/v1', { exclude: ['healthz', 'readyz', 'metrics'] });
  app.use(helmet({ contentSecurityPolicy: !isDev }));
  app.use(cookieParser());
  express.disable('x-powered-by');

  // จำกัดขนาด body ที่ 1 MB (สเปกหัวข้อ 9.3) — upload ใช้ presigned URL ไม่ผ่าน API
  app.useBodyParser('json', { limit: '1mb' });
  app.useBodyParser('urlencoded', { limit: '1mb', extended: true });

  app.enableCors({
    origin: config.CORS_ORIGINS,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  });
}
