import type { INestApplication } from '@nestjs/common';
import { signActionToken } from '@nosion/core';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { RedisService } from '../src/infra/redis/redis.service';
import { createTestApp, registerAndLogin, resetRateLimits } from './helpers';

const SECRET = 'n'.repeat(48);
const VAPID_PUBLIC = 'BPublicKeyForTests';

describe('Web Push + ปุ่มใน notification (API + DB จริง)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: RedisService;
  let alice = '';
  let aliceId = '';
  let bob = '';
  let bobId = '';
  const saved = {
    secret: process.env.NOTIFICATION_ACTION_SECRET,
    vapid: process.env.VAPID_PUBLIC_KEY,
  };

  beforeAll(async () => {
    // config อ่าน env ตอน bootstrap — ตั้งก่อนยกแอป แล้วคืนค่าเดิมตอนจบ (ไฟล์อื่นรัน fork เดียวกัน)
    process.env.NOTIFICATION_ACTION_SECRET = SECRET;
    process.env.VAPID_PUBLIC_KEY = VAPID_PUBLIC;
    const ctx = await createTestApp();
    app = ctx.app;
    prisma = ctx.prisma;
    redis = ctx.redis;
    alice = await registerAndLogin(app, 'alice-push');
    bob = await registerAndLogin(app, 'bob-push');
    aliceId = (await api().get('/api/v1/me').set(as(alice))).body.user.id;
    bobId = (await api().get('/api/v1/me').set(as(bob))).body.user.id;
  });

  afterAll(async () => {
    await app.close();
    process.env.NOTIFICATION_ACTION_SECRET = saved.secret;
    process.env.VAPID_PUBLIC_KEY = saved.vapid;
    if (saved.secret === undefined) delete process.env.NOTIFICATION_ACTION_SECRET;
    if (saved.vapid === undefined) delete process.env.VAPID_PUBLIC_KEY;
  });

  beforeEach(async () => {
    await resetRateLimits(redis);
  });

  const api = () => request(app.getHttpServer());
  const as = (token: string) => ({ Authorization: `Bearer ${token}` });
  const subscription = (endpoint: string) => ({
    endpoint,
    keys: { p256dh: 'BKey', auth: 'authSecret' },
    userAgent: 'Mozilla/5.0 (iPhone)',
  });
  const createBill = async () =>
    (
      await api()
        .post('/api/v1/entries')
        .set(as(alice))
        .send({
          module: 'expense',
          title: 'ค่าเน็ต',
          occurredAt: new Date(Date.now() + 86_400_000).toISOString().slice(0, 10),
          payload: { amountMinor: 79_900, isBill: true },
          status: 'pending',
        })
        .expect(201)
    ).body as { id: string; occurredAt: string };

  it('GET /push/config ให้ VAPID public key', async () => {
    const res = await api().get('/api/v1/push/config').set(as(alice)).expect(200);
    expect(res.body).toEqual({ publicKey: VAPID_PUBLIC });
  });

  it('subscribe ซ้ำได้แถวเดียว · เครื่องเดิมเปลี่ยนบัญชี = ย้ายเจ้าของ · unsubscribe ลบได้เฉพาะของตัวเอง', async () => {
    const endpoint = 'https://fcm.googleapis.com/fcm/send/device-1';
    await api()
      .post('/api/v1/push/subscribe')
      .set(as(alice))
      .send(subscription(endpoint))
      .expect(204);
    await api()
      .post('/api/v1/push/subscribe')
      .set(as(alice))
      .send(subscription(endpoint))
      .expect(204);
    expect(await prisma.pushSubscription.count({ where: { endpoint } })).toBe(1);

    await api()
      .post('/api/v1/push/subscribe')
      .set(as(bob))
      .send(subscription(endpoint))
      .expect(204);
    const row = await prisma.pushSubscription.findUniqueOrThrow({ where: { endpoint } });
    expect(row.userId).toBe(bobId);

    // alice ลบ endpoint ที่เป็นของ bob แล้วไม่ได้
    await api().delete('/api/v1/push/unsubscribe').set(as(alice)).send({ endpoint }).expect(204);
    expect(await prisma.pushSubscription.count({ where: { endpoint } })).toBe(1);
    await api().delete('/api/v1/push/unsubscribe').set(as(bob)).send({ endpoint }).expect(204);
    expect(await prisma.pushSubscription.count({ where: { endpoint } })).toBe(0);
  });

  it('subscription ผิดรูป → 422', async () => {
    await api()
      .post('/api/v1/push/subscribe')
      .set(as(alice))
      .send({ endpoint: 'not-a-url', keys: { p256dh: 'x', auth: 'y' } })
      .expect(422);
  });

  it('กด "จ่ายแล้ว" จาก notification (ไม่มี access token) → รายการเป็น done', async () => {
    const bill = await createBill();
    const token = signActionToken({ userId: aliceId, entryId: bill.id }, SECRET);
    await api()
      .post('/api/v1/notifications/actions')
      .send({ token, action: 'complete' })
      .expect(204);
    const entry = await prisma.entry.findUniqueOrThrow({ where: { id: bill.id } });
    expect(entry.status).toBe('done');
    expect(entry.completedAt).not.toBeNull();
  });

  it('กด "เลื่อน 1 วัน" → วันกำหนดเลื่อนไป 1 วัน และการเตือนเลื่อนตาม', async () => {
    const bill = await createBill();
    await api()
      .post(`/api/v1/entries/${bill.id}/reminders`)
      .set(as(alice))
      .send({ channel: 'push', offsetMinutes: -60 })
      .expect(201);
    const token = signActionToken({ userId: aliceId, entryId: bill.id }, SECRET);
    await api().post('/api/v1/notifications/actions').send({ token, action: 'defer' }).expect(204);
    const entry = await prisma.entry.findUniqueOrThrow({
      where: { id: bill.id },
      include: { reminders: true },
    });
    expect(entry.occurredAt!.getTime()).toBe(new Date(bill.occurredAt).getTime() + 86_400_000);
    expect(entry.reminders[0]!.fireAt.getTime()).toBe(entry.occurredAt!.getTime() - 3_600_000);
  });

  it('token ปลอม / หมดอายุ / ของคนอื่นกับรายการเรา → 401 และรายการไม่เปลี่ยน', async () => {
    const bill = await createBill();
    const expired = signActionToken(
      { userId: aliceId, entryId: bill.id },
      SECRET,
      new Date(Date.now() - 8 * 86_400_000),
    );
    const wrongSecret = signActionToken({ userId: aliceId, entryId: bill.id }, 'x'.repeat(48));
    for (const token of [expired, wrongSecret, 'garbage']) {
      await api()
        .post('/api/v1/notifications/actions')
        .send({ token, action: 'complete' })
        .expect(401);
    }
    // token ที่ถูกต้องแต่ชื่อ bob กับรายการของ alice → bob ไม่เห็นรายการนี้ (404) และไม่ถูกแตะ
    const bobsToken = signActionToken({ userId: bobId, entryId: bill.id }, SECRET);
    await api()
      .post('/api/v1/notifications/actions')
      .send({ token: bobsToken, action: 'complete' })
      .expect(404);
    expect((await prisma.entry.findUniqueOrThrow({ where: { id: bill.id } })).status).toBe(
      'pending',
    );
  });
});
