import type { INestApplication } from '@nestjs/common';
import { signUnsubscribeToken } from '@nosion/core';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { RedisService } from '../src/infra/redis/redis.service';
import { createTestApp, registerAndLogin, resetRateLimits } from './helpers';

const SECRET = 'm'.repeat(48);

describe('เลิกรับอีเมล (API + DB จริง)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: RedisService;
  let userId = '';
  const saved = process.env.NOTIFICATION_ACTION_SECRET;

  beforeAll(async () => {
    process.env.NOTIFICATION_ACTION_SECRET = SECRET;
    const ctx = await createTestApp();
    app = ctx.app;
    prisma = ctx.prisma;
    redis = ctx.redis;
    const token = await registerAndLogin(app, 'mail-unsub');
    userId = (
      await request(app.getHttpServer()).get('/api/v1/me').set('Authorization', `Bearer ${token}`)
    ).body.user.id;
  });

  afterAll(async () => {
    await app.close();
    if (saved === undefined) delete process.env.NOTIFICATION_ACTION_SECRET;
    else process.env.NOTIFICATION_ACTION_SECRET = saved;
  });

  beforeEach(async () => {
    await resetRateLimits(redis);
  });

  const api = () => request(app.getHttpServer());
  const settings = () => prisma.userSettings.findUniqueOrThrow({ where: { userId } });

  it('GET แสดงหน้ายืนยันเท่านั้น — ตัวสแกนลิงก์กดเองแล้วต้องไม่เลิกรับให้', async () => {
    const token = signUnsubscribeToken({ userId, kind: 'digest' }, SECRET);
    const res = await api().get(`/api/v1/email/unsubscribe?token=${token}`).expect(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.text).toContain('เลิกรับอีเมลสรุปรายวัน?');
    expect(res.text).toContain('<form method="post">');
    expect((await settings()).dailyDigestEnabled).toBe(true);
  });

  it('POST (ปุ่มยืนยัน หรือ one-click ของ Gmail) → ปิดเฉพาะชนิดนั้น · ซ้ำได้', async () => {
    const token = signUnsubscribeToken({ userId, kind: 'weekly' }, SECRET);
    for (let i = 0; i < 2; i += 1) {
      const res = await api()
        .post(`/api/v1/email/unsubscribe?token=${token}`)
        .type('form')
        .send('List-Unsubscribe=One-Click')
        .expect(200);
      expect(res.text).toContain('เลิกรับสรุปสัปดาห์แล้ว');
    }
    const s = await settings();
    expect(s.weeklyReviewEnabled).toBe(false);
    expect(s.dailyDigestEnabled).toBe(true);
  });

  it('token ผิด / secret อื่น → หน้าบอกว่าลิงก์ใช้ไม่ได้ และไม่เปลี่ยนอะไร', async () => {
    const wrong = signUnsubscribeToken({ userId, kind: 'digest' }, 'z'.repeat(48));
    for (const token of [wrong, 'garbage', '']) {
      const res = await api().post(`/api/v1/email/unsubscribe?token=${token}`).expect(200);
      expect(res.text).toContain('หมดอายุหรือไม่ถูกต้อง');
    }
    expect((await settings()).dailyDigestEnabled).toBe(true);
  });
});
