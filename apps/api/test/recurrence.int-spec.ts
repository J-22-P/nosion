import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { RedisService } from '../src/infra/redis/redis.service';
import { RecurrenceService } from '../src/recurrence/recurrence.service';
import { createTestApp, registerAndLogin, resetRateLimits } from './helpers';

/** บิลค่าเน็ต 799 บาท — template ที่ใช้ในหลายเทสต์ */
const internetBill = {
  module: 'expense',
  title: 'ค่าเน็ต',
  payload: { amountMinor: 79_900, category: 'utilities', costType: 'fixed', isBill: true },
} as const;

describe('Recurrence Engine (API + DB จริง)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: RedisService;
  let recurrence: RecurrenceService;
  let alice = '';
  let aliceId = '';
  let bob = '';

  beforeAll(async () => {
    const ctx = await createTestApp();
    app = ctx.app;
    prisma = ctx.prisma;
    redis = ctx.redis;
    recurrence = app.get(RecurrenceService);
    alice = await registerAndLogin(app, 'alice-recur');
    bob = await registerAndLogin(app, 'bob-recur');
    const me = await request(app.getHttpServer()).get('/api/v1/me').set(as(alice)).expect(200);
    aliceId = me.body.user.id as string;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetRateLimits(redis);
  });

  const api = () => request(app.getHttpServer());
  const as = (token: string) => ({ Authorization: `Bearer ${token}` });

  /** entry ที่ยังไม่ถูกลบของ rule หนึ่ง เรียงตามรอบ */
  const entriesOf = (ruleId: string) =>
    prisma.entry.findMany({
      where: { recurrenceRuleId: ruleId, deletedAt: null },
      orderBy: { recurrenceSlot: 'asc' },
    });

  /** ฟังก์ชัน service ตรง ๆ พร้อม "ตอนนี้" ที่กำหนดเอง — เทสต์เรื่องเวลาไม่ขึ้นกับวันที่รันจริง */
  const createAt = (now: string, input: Record<string, unknown>) =>
    recurrence.create(aliceId, { template: internetBill, ...input } as never, new Date(now));

  describe('DoD Phase 3 + เคสบังคับจากสเปก 6.1', () => {
    it('ตั้งบิลค่าเน็ตทุกวันที่ 31 → รายการเดือน ก.พ. เป็นวันที่ 28', async () => {
      const rule = await createAt('2027-01-10T00:00:00Z', {
        rrule: 'FREQ=MONTHLY;BYMONTHDAY=31',
        startsAt: '2027-01-31',
        timezone: 'Asia/Bangkok',
      });
      const entries = await entriesOf(rule.id);
      // 90 วันจาก 10 ม.ค. = ถึง 10 เม.ย. → 31 ม.ค., 28 ก.พ., 31 มี.ค.
      expect(entries.map((e) => e.occurredAt?.toISOString())).toEqual([
        '2027-01-30T17:00:00.000Z', // 31 ม.ค. 00:00 เวลาไทย
        '2027-02-27T17:00:00.000Z', // 28 ก.พ.
        '2027-03-30T17:00:00.000Z', // 31 มี.ค.
      ]);
      expect(
        entries.every((e) => e.module === 'expense' && e.status === 'pending' && e.isAllDay),
      ).toBe(true);
      expect(entries[0]!.payload).toMatchObject({
        amountMinor: 79_900,
        isBill: true,
        currency: 'THB',
      });
    });

    it('materialize ซ้ำ 2 ครั้ง (และพร้อมกัน) → จำนวน entry ไม่เพิ่ม', async () => {
      const rule = await createAt('2027-01-01T00:00:00Z', {
        rrule: 'FREQ=WEEKLY',
        startsAt: '2027-01-04',
        timezone: 'Asia/Bangkok',
      });
      const before = (await entriesOf(rule.id)).length;
      expect(before).toBeGreaterThan(10);

      // จำลอง cron สองตัวที่อ่าน rule ก่อน materializedUntil จะถูกอัปเดต
      const stale = await prisma.recurrenceRule.findUniqueOrThrow({ where: { id: rule.id } });
      const reset = { ...stale, materializedUntil: null };
      await Promise.all([
        recurrence.materialize(reset, new Date('2027-01-01T00:00:00Z')),
        recurrence.materialize(reset, new Date('2027-01-01T00:00:00Z')),
      ]);
      await recurrence.materialize(stale, new Date('2027-01-01T00:00:00Z'));
      expect((await entriesOf(rule.id)).length).toBe(before);
    });

    it('ลบเฉพาะรอบ → entry วันนั้นหาย และรอบถัดไปไม่สร้างกลับ (idempotent)', async () => {
      const rule = await createAt('2027-01-01T00:00:00Z', {
        rrule: 'FREQ=DAILY',
        startsAt: '2027-01-02',
        timezone: 'Asia/Bangkok',
        endType: 'afterCount',
        maxCount: 5,
      });
      for (let i = 0; i < 2; i += 1) {
        await api()
          .delete(`/api/v1/recurrence-rules/${rule.id}/occurrences/2027-01-03`)
          .set(as(alice))
          .expect(200);
      }
      const saved = await prisma.recurrenceRule.findUniqueOrThrow({ where: { id: rule.id } });
      expect(saved.exceptions.map((d) => d.toISOString())).toEqual(['2027-01-02T17:00:00.000Z']);

      await recurrence.materialize(
        { ...saved, materializedUntil: null },
        new Date('2027-01-01T00:00:00Z'),
      );
      const days = (await entriesOf(rule.id)).map((e) => e.occurredAt?.toISOString().slice(0, 10));
      expect(days).toEqual(['2027-01-01', '2027-01-03', '2027-01-04', '2027-01-05']); // UTC ของวันที่ 2,4,5,6 เวลาไทย
    });

    it('endType=afterCount 5 → ไม่เกิน 5 entry ตลอดกาล', async () => {
      const rule = await createAt('2027-01-01T00:00:00Z', {
        rrule: 'FREQ=MONTHLY;BYMONTHDAY=1',
        startsAt: '2027-02-01',
        timezone: 'Asia/Bangkok',
        endType: 'afterCount',
        maxCount: 5,
      });
      for (const now of ['2027-03-15T00:00:00Z', '2027-06-01T00:00:00Z', '2028-01-01T00:00:00Z']) {
        const row = await prisma.recurrenceRule.findUniqueOrThrow({ where: { id: rule.id } });
        await recurrence.materialize(row, new Date(now));
      }
      expect(await prisma.entry.count({ where: { recurrenceRuleId: rule.id } })).toBe(5);
    });

    it('แก้ template ของ rule → entry ที่สร้างแล้วไม่เปลี่ยน · รอบใหม่ใช้ template ใหม่', async () => {
      const rule = await createAt('2027-01-01T00:00:00Z', {
        rrule: 'FREQ=MONTHLY;BYMONTHDAY=5',
        startsAt: '2027-01-05',
        timezone: 'Asia/Bangkok',
      });
      const existing = await entriesOf(rule.id);
      await recurrence.update(
        aliceId,
        rule.id,
        {
          template: {
            ...internetBill,
            title: 'ค่าเน็ตไฟเบอร์',
            payload: { ...internetBill.payload, amountMinor: 89_900 },
          },
        },
        new Date('2027-01-01T00:00:00Z'),
      );
      const after = await entriesOf(rule.id);
      expect(after.map((e) => [e.id, e.title, e.version])).toEqual(
        existing.map((e) => [e.id, e.title, e.version]),
      );

      const row = await prisma.recurrenceRule.findUniqueOrThrow({ where: { id: rule.id } });
      await recurrence.materialize(row, new Date('2027-03-01T00:00:00Z'));
      const latest = (await entriesOf(rule.id)).at(-1)!;
      expect(latest.title).toBe('ค่าเน็ตไฟเบอร์');
      expect(latest.payload).toMatchObject({ amountMinor: 89_900 });
    });
  });

  describe('แก้ตาราง / หยุด / ลบ — รอบที่ผู้ใช้แตะแล้วต้องอยู่', () => {
    it('เปลี่ยนตาราง → รอบอนาคตที่ไม่ถูกแตะสร้างใหม่ตามตารางใหม่ · รอบที่แก้แล้วอยู่ต่อ', async () => {
      const now = new Date('2027-01-01T00:00:00Z');
      const rule = await createAt(now.toISOString(), {
        rrule: 'FREQ=MONTHLY;BYMONTHDAY=10',
        startsAt: '2027-01-10',
        timezone: 'Asia/Bangkok',
      });
      const [first] = await entriesOf(rule.id);
      await prisma.entry.update({
        where: { id: first!.id },
        data: { title: 'แก้เอง', version: 2 },
      });

      await recurrence.update(aliceId, rule.id, { rrule: 'FREQ=MONTHLY;BYMONTHDAY=20' }, now);
      const entries = await entriesOf(rule.id);
      expect(entries.find((e) => e.id === first!.id)?.title).toBe('แก้เอง');
      const regenerated = entries.filter((e) => e.id !== first!.id);
      expect(regenerated.length).toBeGreaterThan(0);
      expect(regenerated.every((e) => e.occurredAt?.toISOString().slice(8, 10) === '19')).toBe(
        true,
      ); // 20 ไทย = 19 UTC 17:00
    });

    it('หยุดแล้วเริ่มต่อ → รอบอนาคตหายตอนหยุด และกลับมาเมื่อเริ่มต่อ', async () => {
      const now = new Date('2027-01-01T00:00:00Z');
      const rule = await createAt(now.toISOString(), {
        rrule: 'FREQ=WEEKLY',
        startsAt: '2027-01-04',
        timezone: 'Asia/Bangkok',
      });
      const count = (await entriesOf(rule.id)).length;
      await recurrence.setPaused(aliceId, rule.id, true, now);
      expect(await entriesOf(rule.id)).toHaveLength(0);
      await recurrence.materializeDue(now);
      expect(await entriesOf(rule.id)).toHaveLength(0);

      const resumed = await recurrence.setPaused(aliceId, rule.id, false, now);
      expect(resumed.isPaused).toBe(false);
      expect(await entriesOf(rule.id)).toHaveLength(count);
    });

    it('ลบ rule → รายการที่ทำเสร็จแล้วยังอยู่ · รอบอนาคตที่ไม่ถูกแตะหาย · GET ได้ 404', async () => {
      const now = new Date('2027-01-01T00:00:00Z');
      const rule = await createAt(now.toISOString(), {
        rrule: 'FREQ=WEEKLY',
        startsAt: '2027-01-04',
        timezone: 'Asia/Bangkok',
      });
      const [first] = await entriesOf(rule.id);
      await prisma.entry.update({ where: { id: first!.id }, data: { status: 'done', version: 2 } });

      await recurrence.remove(aliceId, rule.id, now);
      expect((await entriesOf(rule.id)).map((e) => e.id)).toEqual([first!.id]);
      await api().get(`/api/v1/recurrence-rules/${rule.id}`).set(as(alice)).expect(404);
    });
  });

  describe('HTTP', () => {
    it('สร้างผ่าน API → ได้ entry ทันที, list / get / preview ใช้ได้', async () => {
      const startsAt = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
      const created = await api()
        .post('/api/v1/recurrence-rules')
        .set(as(alice))
        .send({ rrule: 'FREQ=WEEKLY', startsAt, template: internetBill })
        .expect(201);
      expect(created.body).toMatchObject({
        rrule: 'FREQ=WEEKLY',
        timezone: 'Asia/Bangkok',
        endType: 'never',
      });
      expect(created.body.materializedUntil).not.toBeNull();

      expect((await entriesOf(created.body.id as string)).length).toBeGreaterThanOrEqual(12);
      const one = (await entriesOf(created.body.id as string))[0]!;
      const viaApi = await api().get(`/api/v1/entries/${one.id}`).set(as(alice)).expect(200);
      expect(viaApi.body.recurrenceRuleId).toBe(created.body.id);

      const list = await api().get('/api/v1/recurrence-rules').set(as(alice)).expect(200);
      expect(list.body.map((r: { id: string }) => r.id)).toContain(created.body.id);

      const preview = await api()
        .post(`/api/v1/recurrence-rules/${created.body.id}/preview?limit=3`)
        .set(as(alice))
        .expect(200);
      expect(preview.body.occurrences).toHaveLength(3);
      expect(preview.body.localDates[0]).toBe(startsAt);
    });

    it('preview กฎที่ยังไม่บันทึก — ไม่เขียน DB', async () => {
      const before = await prisma.recurrenceRule.count();
      const res = await api()
        .post('/api/v1/recurrence-rules/preview')
        .set(as(alice))
        .send({
          rrule: 'FREQ=MONTHLY;BYMONTHDAY=31',
          startsAt: '2030-01-31',
          timezone: 'Asia/Bangkok',
          limit: 3,
        })
        .expect(200);
      expect(res.body.localDates).toEqual(['2030-01-31', '2030-02-28', '2030-03-31']);
      expect(await prisma.recurrenceRule.count()).toBe(before);
    });

    it.each([
      ['FREQ ต่ำกว่ารายวัน', { rrule: 'FREQ=HOURLY' }],
      ['ใส่ COUNT ใน rrule', { rrule: 'FREQ=DAILY;COUNT=3' }],
      ['timezone ไม่มีจริง', { timezone: 'Mars/Olympus' }],
      ['onDate ไม่มี endsAt', { endType: 'onDate' }],
      ['afterCount ไม่มี maxCount', { endType: 'afterCount' }],
      [
        'payload ของ template ผิด',
        { template: { ...internetBill, payload: { amountMinor: 1.5 } } },
      ],
      ['กฎที่ไม่มีรอบจริง', { endType: 'onDate', endsAt: '2030-01-01', startsAt: '2030-02-01' }],
    ])('%s → 422', async (_name, override) => {
      await api()
        .post('/api/v1/recurrence-rules')
        .set(as(alice))
        .send({ rrule: 'FREQ=DAILY', startsAt: '2030-01-01', template: internetBill, ...override })
        .expect(422);
    });

    it('ผู้ใช้อื่นเข้าถึง rule ไม่ได้ (IDOR) → 404 ทุก endpoint', async () => {
      const created = await api()
        .post('/api/v1/recurrence-rules')
        .set(as(alice))
        .send({ rrule: 'FREQ=DAILY', startsAt: '2030-01-01', template: internetBill })
        .expect(201);
      const id = created.body.id as string;
      await api().get(`/api/v1/recurrence-rules/${id}`).set(as(bob)).expect(404);
      await api()
        .patch(`/api/v1/recurrence-rules/${id}`)
        .set(as(bob))
        .send({ rrule: 'FREQ=WEEKLY' })
        .expect(404);
      await api().post(`/api/v1/recurrence-rules/${id}/pause`).set(as(bob)).send({}).expect(404);
      await api()
        .delete(`/api/v1/recurrence-rules/${id}/occurrences/2030-01-02`)
        .set(as(bob))
        .expect(404);
      await api().delete(`/api/v1/recurrence-rules/${id}`).set(as(bob)).expect(404);
      const bobs = await api().get('/api/v1/recurrence-rules').set(as(bob)).expect(200);
      expect(bobs.body).toEqual([]);
    });

    it('ลบรอบในวันที่ไม่มีรอบ → 404 · รูปแบบวันที่ผิด → 422', async () => {
      const created = await api()
        .post('/api/v1/recurrence-rules')
        .set(as(alice))
        .send({
          rrule: 'FREQ=MONTHLY;BYMONTHDAY=1',
          startsAt: '2030-01-01',
          template: internetBill,
        })
        .expect(201);
      await api()
        .delete(`/api/v1/recurrence-rules/${created.body.id}/occurrences/2030-01-15`)
        .set(as(alice))
        .expect(404);
      await api()
        .delete(`/api/v1/recurrence-rules/${created.body.id}/occurrences/15-01-2030`)
        .set(as(alice))
        .expect(422);
    });

    it('POST /materialize idempotent และจำกัด 6 ครั้ง/นาที', async () => {
      await api()
        .post('/api/v1/recurrence-rules')
        .set(as(alice))
        .send({ rrule: 'FREQ=DAILY', startsAt: '2030-01-01', template: internetBill })
        .expect(201);
      await resetRateLimits(redis);
      const first = await api()
        .post('/api/v1/recurrence-rules/materialize')
        .set(as(alice))
        .expect(200);
      expect(first.body.rules).toBeGreaterThan(0);
      for (let i = 0; i < 5; i += 1) {
        const again = await api()
          .post('/api/v1/recurrence-rules/materialize')
          .set(as(alice))
          .expect(200);
        expect(again.body.created).toBe(0);
      }
      await api().post('/api/v1/recurrence-rules/materialize').set(as(alice)).expect(429);
    });

    it('endpoint cron ปิดอยู่เมื่อไม่ได้ตั้ง CRON_SECRET', async () => {
      await api().get('/api/v1/internal/cron/recurrence').expect(404);
    });
  });
});
