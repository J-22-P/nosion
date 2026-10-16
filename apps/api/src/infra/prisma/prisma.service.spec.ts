import { describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../config/env';
import { PrismaService } from './prisma.service';

const config = {
  DATABASE_URL: 'postgresql://u:p@127.0.0.1:1/none',
  NODE_ENV: 'production',
} as AppConfig;

describe('PrismaService', () => {
  it('ต่อฐานข้อมูลตอนเริ่มไม่ได้ → ไม่ล้มทั้ง process (Vercel จะได้ไม่เปิด instance ใหม่มาตายซ้ำ)', async () => {
    const prisma = new PrismaService(config);
    vi.spyOn(prisma, '$connect').mockRejectedValue(new Error('EMAXCONN'));
    await expect(prisma.onModuleInit()).resolves.toBeUndefined();
  });
});
