import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { RedisService } from '../src/infra/redis/redis.service';
import { createTestApp, resetRateLimits, STRONG_PASSWORD, uniqueEmail } from './helpers';

describe('Auth flow', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: RedisService;

  beforeAll(async () => {
    const ctx = await createTestApp();
    app = ctx.app;
    prisma = ctx.prisma;
    redis = ctx.redis;
  });

  beforeEach(async () => {
    await resetRateLimits(redis);
  });

  afterAll(async () => {
    await app.close();
  });

  const api = () => request(app.getHttpServer());

  it('สมัคร → ได้ access token และ refresh cookie ที่เป็น httpOnly', async () => {
    const res = await api()
      .post('/api/v1/auth/register')
      .send({ email: uniqueEmail('reg'), password: STRONG_PASSWORD, displayName: 'ทดสอบ' })
      .expect(201);

    expect(res.body.accessToken).toBeTruthy();
    const cookies = res.headers['set-cookie'] as unknown as string[];
    expect(cookies.join(';')).toMatch(/nosion_rt=/);
    expect(cookies.join(';')).toMatch(/HttpOnly/i);
    // access token ต้องไม่โผล่ใน cookie ที่ JavaScript อ่านได้
    expect(cookies.join(';')).not.toContain(res.body.accessToken);
  });

  it('รหัสผ่านสั้นกว่า 12 ตัว → 422 พร้อม error ราย field ตาม RFC 9457', async () => {
    const res = await api()
      .post('/api/v1/auth/register')
      .send({ email: uniqueEmail('weak'), password: 'sh0rt', displayName: 'ทดสอบ' })
      .expect(422);

    expect(res.body.type).toContain('validation-failed');
    expect(res.body.errors?.[0]?.path).toBe('password');
    expect(res.body.traceId).toBeTruthy();
  });

  it('อีเมลไม่มีในระบบ กับ รหัสผ่านผิด ต้องตอบเหมือนกัน (กัน user enumeration)', async () => {
    const email = uniqueEmail('enum');
    await api()
      .post('/api/v1/auth/register')
      .send({ email, password: STRONG_PASSWORD, displayName: 'ทดสอบ' })
      .expect(201);

    const wrongPassword = await api()
      .post('/api/v1/auth/login')
      .send({ email, password: `${STRONG_PASSWORD}-ผิด` })
      .expect(401);

    const noSuchUser = await api()
      .post('/api/v1/auth/login')
      .send({ email: uniqueEmail('ghost'), password: STRONG_PASSWORD })
      .expect(401);

    expect(wrongPassword.body.detail).toBe(noSuchUser.body.detail);
  });

  it('หมุน refresh token: ใบเก่าซ้ำภายใน 20 วิได้ใบใหม่ (สองแท็บ) · พ้นช่วงแล้วใช้ซ้ำ = เพิกถอนทั้ง family', async () => {
    const email = uniqueEmail('rotate');
    const registered = await api()
      .post('/api/v1/auth/register')
      .send({ email, password: STRONG_PASSWORD, displayName: 'ทดสอบ' })
      .expect(201);

    const firstCookie = extractRefreshCookie(registered);

    // หมุนครั้งที่ 1 — ได้ใบใหม่
    const rotated = await api().post('/api/v1/auth/refresh').set('Cookie', firstCookie).expect(200);
    expect(rotated.body.accessToken).toBeTruthy();

    // ใบเก่าถูกส่งมาอีกภายใน 20 วิ (สองแท็บ / รีเฟรชระหว่างหมุน / คำตอบหาย) — ไม่ใช่การขโมย ได้ใบใหม่
    const twin = await api().post('/api/v1/auth/refresh').set('Cookie', firstCookie).expect(200);
    expect(twin.body.accessToken).toBeTruthy();
    expect(extractRefreshCookie(twin)).not.toBe(extractRefreshCookie(rotated));

    // พ้นช่วงผ่อนผันแล้ว ใช้ใบเก่าซ้ำ = สัญญาณว่า token ถูกขโมย
    await prisma.session.updateMany({
      where: { revokedReason: 'rotated', user: { email } },
      data: { revokedAt: new Date(Date.now() - 60_000) },
    });
    const reuse = await api().post('/api/v1/auth/refresh').set('Cookie', firstCookie).expect(401);
    expect(reuse.body.type).toContain('token-reuse-detected');

    // ทุก session ของ family นี้ต้องถูกเพิกถอน แม้แต่ใบล่าสุดที่เพิ่งออกให้
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    const active = await prisma.session.count({ where: { userId: user.id, revokedAt: null } });
    expect(active).toBe(0);
  });

  it('เข้าใช้บัญชีทดลองได้ใน 1 คำขอ พร้อมข้อมูลตัวอย่าง', async () => {
    const res = await api().post('/api/v1/auth/demo').expect(200);
    expect(res.body.user.isDemo).toBe(true);

    const entries = await api()
      .get('/api/v1/entries')
      .set('Authorization', `Bearer ${res.body.accessToken}`)
      .expect(200);
    expect(entries.body.data.length).toBeGreaterThan(0);

    // ข้อมูลชุด mockup (src/auth/demo): ทุกการ์ดของหน้า Today ไม่ว่าง · งบรวม ฿15,000 · standup มีครบ 3 กลุ่ม
    const as = { Authorization: `Bearer ${res.body.accessToken}` };
    const today = await api().get('/api/v1/today').set(as).expect(200);
    expect(today.body.failedModules).toEqual([]);
    expect(today.body.widgets.every((w: { isEmpty: boolean }) => !w.isEmpty)).toBe(true);
    const status = await api().get('/api/v1/budgets/status').set(as).expect(200);
    expect(status.body.total).toMatchObject({ budgetMinor: 1500000, budgetSource: 'total' });
    expect(status.body.total.spentMinor).toBeGreaterThan(0);
    const standup = await api().get('/api/v1/tasks/standup/today').set(as).expect(200);
    expect(standup.body.blocked.map((t: { title: string }) => t.title)).toContain(
      'Merge Pull Request #108: IndexedDB Outbox Engine',
    );
    const trends = await api().get('/api/v1/expenses/trends?months=6').set(as).expect(200);
    expect(trends.body.points.every((p: { expenseMinor: number }) => p.expenseMinor > 0)).toBe(
      true,
    );
  });

  it('endpoint ที่ต้องล็อกอิน ปฏิเสธคำขอที่ไม่มี token', async () => {
    await api().get('/api/v1/entries').expect(401);
    await api().get('/api/v1/me').expect(401);
  });
});

function extractRefreshCookie(res: request.Response): string {
  const cookies = res.headers['set-cookie'] as unknown as string[];
  const found = cookies.find((c) => c.startsWith('nosion_rt='));
  if (!found) throw new Error('ไม่พบ refresh cookie ใน response');
  return found.split(';')[0]!;
}
