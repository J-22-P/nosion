import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { ProblemDetailsFilter } from '../src/common/problem.filter';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { RedisService } from '../src/infra/redis/redis.service';

export interface TestContext {
  app: INestApplication;
  prisma: PrismaService;
  redis: RedisService;
}

/**
 * ยกแอปจริงทั้งตัวขึ้นมา (ไม่ mock Prisma) — integration test ที่ mock DB
 * จะไม่จับบั๊กที่เกิดจริงอย่าง constraint, cascade หรือ transaction
 */
export async function createTestApp(): Promise<TestContext> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api/v1', { exclude: ['healthz', 'readyz', 'metrics'] });
  app.use(cookieParser());
  app.useGlobalFilters(new ProblemDetailsFilter());
  await app.init();

  const prisma = app.get(PrismaService);
  await prisma.truncateAll();

  const redis = app.get(RedisService);
  await resetRateLimits(redis);

  return { app, prisma, redis };
}

/**
 * ตัวนับ rate limit อยู่ใน Redis และอยู่ข้ามเทสต์ — ทุกเทสต์ยิงมาจาก IP เดียวกัน
 * ถ้าไม่ล้าง เทสต์ที่รันทีหลังจะโดน 429 ทั้งที่ตรรกะถูกต้อง
 *
 * ล้างก่อนทุกเทสต์แทนการปิด guard ใน test mode — เพราะการปิดไปเลยแปลว่า
 * เราไม่เคยทดสอบเส้นทางที่มี guard ทำงานจริงเลย
 */
export async function resetRateLimits(redis: RedisService): Promise<void> {
  try {
    await redis.client.flushdb();
  } catch {
    // Redis ไม่พร้อม = guard fail-open อยู่แล้ว ไม่ต้องทำอะไร
  }
}

export const uniqueEmail = (prefix = 'user') =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;

export const STRONG_PASSWORD = 'correct-horse-battery-staple-2026';
