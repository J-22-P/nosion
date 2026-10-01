import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { RedisService } from '../src/infra/redis/redis.service';
import { createTestApp, registerAndLogin, resetRateLimits } from './helpers';

describe('Expense module', () => {
  let app: INestApplication;
  let redis: RedisService;
  let alice = '';

  beforeAll(async () => {
    const ctx = await createTestApp();
    app = ctx.app;
    redis = ctx.redis;
    alice = await registerAndLogin(app, 'alice-expenses');
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetRateLimits(redis);
  });

  const api = () => request(app.getHttpServer());
  const as = (token: string) => ({ Authorization: `Bearer ${token}` });

  it('ลงทะเบียนแล้ว /entries รับ module=expense ได้ทันทีโดยไม่แก้ entries เลย', async () => {
    const created = await api()
      .post('/api/v1/entries')
      .set(as(alice))
      .send({ module: 'expense', title: 'กาแฟ', payload: { amountMinor: 6500, category: 'food' } })
      .expect(201);

    // default จาก expensePayloadSchema ถูกเติมให้
    expect(created.body.payload).toMatchObject({
      amountMinor: 6500,
      currency: 'THB',
      direction: 'expense',
      costType: 'variable',
      isBill: false,
    });

    const list = await api().get('/api/v1/entries?module=expense').set(as(alice)).expect(200);
    expect(list.body.data.map((e: { id: string }) => e.id)).toContain(created.body.id);
  });

  it('payload ผิดสัญญา (amountMinor ทศนิยม / หมวดที่ไม่มี) → 422 ตาม ProblemDetailsFilter', async () => {
    for (const payload of [{ amountMinor: 65.5 }, { amountMinor: 6500, category: 'pets' }]) {
      await api()
        .post('/api/v1/entries')
        .set(as(alice))
        .send({ module: 'expense', title: 'ผิด', payload })
        .expect(422);
    }
  });
});
