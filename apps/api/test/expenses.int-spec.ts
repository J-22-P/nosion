import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { RedisService } from '../src/infra/redis/redis.service';
import { createTestApp, registerAndLogin, resetRateLimits } from './helpers';

describe('Expense module', () => {
  let app: INestApplication;
  let redis: RedisService;
  let alice = '';
  let bob = '';

  beforeAll(async () => {
    const ctx = await createTestApp();
    app = ctx.app;
    redis = ctx.redis;
    alice = await registerAndLogin(app, 'alice-expenses');
    bob = await registerAndLogin(app, 'bob-expenses');
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

  async function spend(
    token: string,
    title: string,
    payload: Record<string, unknown>,
    occurredAt: string,
  ) {
    await api()
      .post('/api/v1/entries')
      .set(as(token))
      .send({ module: 'expense', title, status: 'done', occurredAt, payload })
      .expect(201);
  }

  describe('/budgets', () => {
    it('CRUD · งบรวมซ้ำ → 409 (partial unique index) · หมวดซ้ำ → 409', async () => {
      const total = await api()
        .post('/api/v1/budgets')
        .set(as(alice))
        .send({ amountMinor: 1500000 })
        .expect(201);
      expect(total.body).toMatchObject({ category: null, currency: 'THB', alertThreshold: 80 });

      // ก่อนมี migration budget_one_total ตัวนี้ได้ 201 — NULL ไม่ชน unique เดิม
      await api().post('/api/v1/budgets').set(as(alice)).send({ amountMinor: 900000 }).expect(409);

      await api()
        .post('/api/v1/budgets')
        .set(as(alice))
        .send({ category: 'food', amountMinor: 500000 })
        .expect(201);
      await api()
        .post('/api/v1/budgets')
        .set(as(alice))
        .send({ category: 'food', amountMinor: 1 })
        .expect(409);

      // ผู้ใช้คนอื่นตั้งงบรวมของตัวเองได้ (index เป็นต่อ userId)
      await api().post('/api/v1/budgets').set(as(bob)).send({ amountMinor: 100 }).expect(201);

      const updated = await api()
        .patch(`/api/v1/budgets/${total.body.id}`)
        .set(as(alice))
        .send({ amountMinor: 1600000 })
        .expect(200);
      expect(updated.body.amountMinor).toBe(1600000);

      const list = await api().get('/api/v1/budgets').set(as(alice)).expect(200);
      expect(list.body.map((b: { category: string | null }) => b.category)).toEqual([null, 'food']);
    });

    it('IDOR: แก้/ลบงบของคนอื่น → 404', async () => {
      const mine = await api()
        .post('/api/v1/budgets')
        .set(as(alice))
        .send({ category: 'transport', amountMinor: 200000 })
        .expect(201);
      await api()
        .patch(`/api/v1/budgets/${mine.body.id}`)
        .set(as(bob))
        .send({ amountMinor: 1 })
        .expect(404);
      await api().delete(`/api/v1/budgets/${mine.body.id}`).set(as(bob)).expect(404);
      await api().delete(`/api/v1/budgets/${mine.body.id}`).set(as(alice)).expect(204);
    });
  });

  describe('GET /budgets/status', () => {
    it('นับตามเดือนในโซนเวลาไทย · ไม่รวมรายรับ / บิลค้างจ่าย / ของคนอื่น', async () => {
      // 31 ส.ค. 18:00Z = 1 ก.ย. 01:00 เวลาไทย → ต้องนับในเดือนกันยายน
      await spend(
        alice,
        'ข้าวต้มดึก',
        { amountMinor: 6000, category: 'food' },
        '2026-08-31T18:00:00Z',
      );
      // 30 ก.ย. 17:30Z = 1 ต.ค. 00:30 เวลาไทย → ไม่นับ
      await spend(
        alice,
        'กาแฟตุลา',
        { amountMinor: 9900, category: 'food' },
        '2026-09-30T17:30:00Z',
      );
      await spend(
        alice,
        'เงินเดือน',
        { amountMinor: 4500000, direction: 'income' },
        '2026-09-25T03:00:00Z',
      );
      await api()
        .post('/api/v1/entries')
        .set(as(alice))
        .send({
          module: 'expense',
          title: 'ค่าเน็ต',
          occurredAt: '2026-09-05T00:00:00Z',
          payload: { amountMinor: 79900, category: 'utilities', isBill: true },
        })
        .expect(201);
      await spend(
        bob,
        'ของบ็อบ',
        { amountMinor: 777700, category: 'food' },
        '2026-09-10T03:00:00Z',
      );

      const res = await api()
        .get('/api/v1/budgets/status?period=2026-09')
        .set(as(alice))
        .expect(200);

      expect(res.body).toMatchObject({
        period: '2026-09',
        firstDay: '2026-09-01',
        lastDay: '2026-09-30',
      });
      expect(res.body.total).toMatchObject({
        spentMinor: 6000,
        budgetMinor: 1600000,
        budgetSource: 'total',
      });
      expect(res.body.categories[0]).toMatchObject({
        category: 'food',
        spentMinor: 6000,
        budgetMinor: 500000,
      });
    });

    it('period ผิดรูปแบบ → 422', async () => {
      await api().get('/api/v1/budgets/status?period=2026-13').set(as(alice)).expect(422);
    });
  });
});
