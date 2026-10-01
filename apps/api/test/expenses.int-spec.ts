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

  describe('/expenses/*', () => {
    const DAY = 24 * 60 * 60 * 1000;
    /** 'YYYY-MM' ของตอนนี้ตามเวลาไทย (ผู้ใช้ทดสอบใช้ Asia/Bangkok) */
    const currentPeriod = () =>
      new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Bangkok',
        year: 'numeric',
        month: '2-digit',
      })
        .format(new Date())
        .slice(0, 7);

    async function bill(
      token: string,
      title: string,
      amountMinor: number,
      at: Date,
      status = 'pending',
    ) {
      const res = await api()
        .post('/api/v1/entries')
        .set(as(token))
        .send({
          module: 'expense',
          title,
          status,
          occurredAt: at.toISOString(),
          isAllDay: true,
          payload: { amountMinor, category: 'utilities', isBill: true, costType: 'fixed' },
        })
        .expect(201);
      return res.body.id as string;
    }

    it('summary ?period: fixed/variable, รายรับ, หมวด — เฉพาะของผู้ใช้คนนั้น', async () => {
      const res = await api()
        .get('/api/v1/expenses/summary?period=2026-09')
        .set(as(alice))
        .expect(200);
      // จากเทสต์ /budgets/status: ข้าวต้มดึก 60 (food) + เงินเดือน 45,000 · บิลค่าเน็ตยังไม่จ่าย → ไม่นับ
      expect(res.body).toMatchObject({
        period: '2026-09',
        expenseMinor: 6000,
        incomeMinor: 4500000,
        netMinor: 4494000,
        variableMinor: 6000,
        fixedMinor: 0,
        count: 1,
      });
      expect(res.body.byCategory).toEqual([
        { category: 'food', amountMinor: 6000, count: 1, share: 1 },
      ]);
    });

    it('bills/upcoming: JSON filter isBill · ค้างจ่ายข้ามเดือนยังอยู่ · จ่ายแล้วเดือนก่อนไม่อยู่ · ไม่รวมของคนอื่น', async () => {
      const now = new Date();
      const today = await bill(alice, 'บิลวันนี้', 79900, now);
      const overdue = await bill(
        alice,
        'บิลค้าง 40 วัน',
        50000,
        new Date(now.getTime() - 40 * DAY),
      );
      const paidOld = await bill(
        alice,
        'บิลจ่ายแล้วเดือนก่อน',
        12300,
        new Date(now.getTime() - 40 * DAY),
        'done',
      );
      await spend(alice, 'กาแฟไม่ใช่บิล', { amountMinor: 6500 }, now.toISOString());
      const bobs = await bill(bob, 'บิลของบ็อบ', 99900, now);

      const res = await api().get('/api/v1/expenses/bills/upcoming').set(as(alice)).expect(200);
      const ids = res.body.bills.map((b: { id: string }) => b.id);
      expect(ids).toContain(today);
      expect(ids).toContain(overdue);
      expect(ids).not.toContain(paidOld);
      expect(ids).not.toContain(bobs);
      expect(res.body.bills.every((b: { title: string }) => b.title !== 'กาแฟไม่ใช่บิล')).toBe(
        true,
      );

      const todayBill = res.body.bills.find((b: { id: string }) => b.id === today);
      expect(todayBill).toMatchObject({ daysUntilDue: 0, paid: false, amountMinor: 79900 });
      expect(res.body.dueSoonCount).toBeGreaterThanOrEqual(1);
      expect(res.body.overdueCount).toBeGreaterThanOrEqual(1);
      // บิลค้างจากเดือนก่อนไม่นับใน "ต่อเดือน" ของเดือนนี้
      const thisMonth = res.body.bills
        .filter((b: { dueDate: string }) => b.dueDate.startsWith(currentPeriod()))
        .reduce((sum: number, b: { amountMinor: number }) => sum + b.amountMinor, 0);
      expect(res.body.fixedMonthlyMinor).toBe(thisMonth);
      expect(
        res.body.bills
          .find((b: { id: string }) => b.id === overdue)
          .dueDate.startsWith(currentPeriod()),
      ).toBe(false);
    });

    it('forecast: เดือนปัจจุบัน · series ยาวเท่าวันที่ · ใช้งบรวมก้อนเดียวกับ /budgets/status', async () => {
      const [forecast, status] = await Promise.all([
        api().get('/api/v1/expenses/forecast').set(as(alice)).expect(200),
        api().get('/api/v1/budgets/status').set(as(alice)).expect(200),
      ]);
      expect(forecast.body.period).toBe(currentPeriod());
      expect(forecast.body.series).toHaveLength(forecast.body.dayOfMonth);
      expect(forecast.body.budgetMinor).toBe(status.body.total.budgetMinor);
      // บิลวันนี้ 799 ยังไม่จ่าย → อยู่ในคาดการณ์ แต่ไม่อยู่ในยอดใช้จริง
      expect(forecast.body.unpaidBillsMinor).toBeGreaterThanOrEqual(79900);
      expect(forecast.body.projectedMinor).toBeGreaterThanOrEqual(
        forecast.body.spentToDateMinor + forecast.body.unpaidBillsMinor,
      );
    });

    it('trends ?months=3: 3 จุด เก่า→ใหม่ จบที่เดือนนี้ · months เกิน 12 → 422', async () => {
      const res = await api().get('/api/v1/expenses/trends?months=3').set(as(alice)).expect(200);
      expect(res.body.points).toHaveLength(3);
      expect(res.body.points.at(-1).period).toBe(currentPeriod());
      const periods = res.body.points.map((p: { period: string }) => p.period);
      expect([...periods].sort()).toEqual(periods);
      await api().get('/api/v1/expenses/trends?months=13').set(as(alice)).expect(422);
    });
  });

  describe('POST /expenses/parse', () => {
    it('"ค่าเน็ต 799 ทุกวันที่ 5" → บิล fixed · ข้อความที่ไม่มีเงิน → result null · ไม่บันทึกอะไร', async () => {
      const before = await api().get('/api/v1/entries?module=expense').set(as(alice)).expect(200);
      const bill = await api()
        .post('/api/v1/expenses/parse')
        .set(as(alice))
        .send({ text: 'ค่าเน็ต 799 ทุกวันที่ 5' })
        .expect(200);
      expect(bill.body.result).toMatchObject({
        title: 'ค่าเน็ต',
        isAllDay: true,
        payload: { amountMinor: 79900, category: 'utilities', isBill: true, costType: 'fixed' },
      });
      const none = await api()
        .post('/api/v1/expenses/parse')
        .set(as(alice))
        .send({ text: 'ประชุมทีม' })
        .expect(200);
      expect(none.body).toEqual({ result: null });
      const after = await api().get('/api/v1/entries?module=expense').set(as(alice)).expect(200);
      expect(after.body.data).toHaveLength(before.body.data.length);
    });
  });
});
