import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { RedisService } from '../src/infra/redis/redis.service';
import { RecurrenceService } from '../src/recurrence/recurrence.service';
import { createTestApp, registerAndLogin, resetRateLimits } from './helpers';

const DAY = 86_400_000;
/** วันในอนาคตแบบ 'YYYY-MM-DD' — เทสต์ไม่ขึ้นกับวันที่รันจริง */
const futureDay = (days: number) => new Date(Date.now() + days * DAY).toISOString().slice(0, 10);

describe('Reminder (API + DB จริง)', () => {
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
    alice = await registerAndLogin(app, 'alice-remind');
    bob = await registerAndLogin(app, 'bob-remind');
    const me = await api().get('/api/v1/me').set(as(alice)).expect(200);
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
  const createTask = async (occurredAt: string | null, extra: Record<string, unknown> = {}) =>
    (
      await api()
        .post('/api/v1/entries')
        .set(as(alice))
        .send({ module: 'task', title: 'ส่งรายงาน', occurredAt, ...extra })
        .expect(201)
    ).body as { id: string; occurredAt: string; version: number };

  it('ตั้งเตือนล่วงหน้า 1 วัน → fireAt = occurredAt − 1 วัน · เพิ่มซ้ำได้แถวเดิม · list เรียงตามเวลา', async () => {
    const entry = await createTask(futureDay(5));
    const add = () =>
      api()
        .post(`/api/v1/entries/${entry.id}/reminders`)
        .set(as(alice))
        .send({ channel: 'push', offsetMinutes: -1440 })
        .expect(201);
    const first = await add();
    const again = await add();
    expect(again.body.id).toBe(first.body.id);
    expect(new Date(first.body.fireAt).getTime()).toBe(new Date(entry.occurredAt).getTime() - DAY);
    expect(first.body).toMatchObject({ status: 'scheduled', attempts: 0, channel: 'push' });

    await api()
      .post(`/api/v1/entries/${entry.id}/reminders`)
      .set(as(alice))
      .send({ channel: 'push', offsetMinutes: 0 })
      .expect(201);
    const list = await api()
      .get(`/api/v1/entries/${entry.id}/reminders`)
      .set(as(alice))
      .expect(200);
    expect(list.body.map((r: { offsetMinutes: number }) => r.offsetMinutes)).toEqual([-1440, 0]);
  });

  it('สร้างรายการพร้อมเตือน → ได้การเตือนทันที และเพิ่มซ้ำผ่าน endpoint ไม่เกิดแถวใหม่', async () => {
    const entry = await createTask(futureDay(3), {
      reminders: [{ channel: 'push', offsetMinutes: -60 }],
    });
    await api()
      .post(`/api/v1/entries/${entry.id}/reminders`)
      .set(as(alice))
      .send({ channel: 'push', offsetMinutes: -60 })
      .expect(201);
    expect(await prisma.reminder.count({ where: { entryId: entry.id } })).toBe(1);
  });

  it('รายการไม่มีวันกำหนด → 422 · ยกเลิกแล้วสถานะ cancelled (ซ้ำได้) · เพิ่มกลับ = scheduled', async () => {
    const undated = await createTask(null);
    await api()
      .post(`/api/v1/entries/${undated.id}/reminders`)
      .set(as(alice))
      .send({ channel: 'push', offsetMinutes: 0 })
      .expect(422);

    const entry = await createTask(futureDay(2));
    const r = await api()
      .post(`/api/v1/entries/${entry.id}/reminders`)
      .set(as(alice))
      .send({ channel: 'push', offsetMinutes: 0 })
      .expect(201);
    await api().delete(`/api/v1/reminders/${r.body.id}`).set(as(alice)).expect(204);
    await api().delete(`/api/v1/reminders/${r.body.id}`).set(as(alice)).expect(204);
    expect((await prisma.reminder.findUniqueOrThrow({ where: { id: r.body.id } })).status).toBe(
      'cancelled',
    );
    const back = await api()
      .post(`/api/v1/entries/${entry.id}/reminders`)
      .set(as(alice))
      .send({ channel: 'push', offsetMinutes: 0 })
      .expect(201);
    expect(back.body).toMatchObject({ id: r.body.id, status: 'scheduled' });
  });

  it('เลื่อนวัน (PATCH / defer / bulk) → fireAt ตาม · ที่ส่งไปแล้วถูกตั้งใหม่ · ที่ผู้ใช้ยกเลิกไม่ถูกแตะ', async () => {
    const entry = await createTask(futureDay(5), {
      reminders: [
        { channel: 'push', offsetMinutes: -1440 },
        { channel: 'email', offsetMinutes: 0 },
      ],
    });
    const [push, email] = await prisma.reminder.findMany({
      where: { entryId: entry.id },
      orderBy: { offsetMinutes: 'asc' },
    });
    // จำลองว่า push ยิงไปแล้ว และผู้ใช้ยกเลิก email เอง
    await prisma.reminder.update({
      where: { id: push!.id },
      data: { status: 'sent', sentAt: new Date(), jobId: 'job-1' },
    });
    await api().delete(`/api/v1/reminders/${email!.id}`).set(as(alice)).expect(204);

    const moved = await api()
      .patch(`/api/v1/entries/${entry.id}`)
      .set(as(alice))
      .send({ occurredAt: futureDay(10), version: 1 })
      .expect(200);
    const after = await prisma.reminder.findUniqueOrThrow({ where: { id: push!.id } });
    expect(after).toMatchObject({ status: 'scheduled', jobId: null, sentAt: null });
    expect(after.fireAt.getTime()).toBe(new Date(moved.body.occurredAt).getTime() - DAY);
    const untouched = await prisma.reminder.findUniqueOrThrow({ where: { id: email!.id } });
    expect(untouched.status).toBe('cancelled');
    expect(untouched.fireAt).toEqual(email!.fireAt);

    const deferred = await api()
      .post(`/api/v1/entries/${entry.id}/defer?to=next-week`)
      .set(as(alice))
      .expect(201);
    expect(
      (await prisma.reminder.findUniqueOrThrow({ where: { id: push!.id } })).fireAt.getTime(),
    ).toBe(new Date(deferred.body.occurredAt).getTime() - DAY);

    await api()
      .post('/api/v1/entries/bulk')
      .set(as(alice))
      .send({ ids: [entry.id], action: 'defer', to: 'tomorrow' })
      .expect(201);
    const bulk = await prisma.entry.findUniqueOrThrow({ where: { id: entry.id } });
    expect(
      (await prisma.reminder.findUniqueOrThrow({ where: { id: push!.id } })).fireAt.getTime(),
    ).toBe(bulk.occurredAt!.getTime() - DAY);
  });

  it('กฎการเกิดซ้ำที่มี reminders ใน template → ทุกรอบได้การเตือน · materialize ซ้ำไม่สร้างซ้ำ', async () => {
    const now = new Date('2027-01-01T00:00:00Z');
    const rule = await recurrence.create(
      aliceId,
      {
        rrule: 'FREQ=MONTHLY;BYMONTHDAY=31',
        startsAt: '2027-01-31',
        timezone: 'Asia/Bangkok',
        template: {
          module: 'expense',
          title: 'ค่าเน็ต',
          payload: { amountMinor: 79_900, isBill: true },
          reminders: [{ channel: 'push', offsetMinutes: -1440 }],
        },
      },
      now,
    );
    const entries = await prisma.entry.findMany({
      where: { recurrenceRuleId: rule.id },
      include: { reminders: true },
      orderBy: { recurrenceSlot: 'asc' },
    });
    expect(entries.length).toBeGreaterThan(1);
    for (const e of entries) {
      expect(e.reminders).toHaveLength(1);
      expect(e.reminders[0]!.fireAt.getTime()).toBe(e.occurredAt!.getTime() - DAY);
    }
    // ก.พ. รอบ clamp เป็นวันที่ 28 → เตือนวันที่ 27 เวลาไทย
    expect(entries[1]!.reminders[0]!.fireAt.toISOString()).toBe('2027-02-26T17:00:00.000Z');

    const row = await prisma.recurrenceRule.findUniqueOrThrow({ where: { id: rule.id } });
    await recurrence.materialize({ ...row, materializedUntil: null }, now);
    expect(await prisma.reminder.count({ where: { entry: { recurrenceRuleId: rule.id } } })).toBe(
      entries.length,
    );
  });

  it('ผู้ใช้อื่นเข้าถึงการเตือนไม่ได้ (IDOR) → 404', async () => {
    const entry = await createTask(futureDay(4), {
      reminders: [{ channel: 'push', offsetMinutes: 0 }],
    });
    const [r] = await prisma.reminder.findMany({ where: { entryId: entry.id } });
    await api().get(`/api/v1/entries/${entry.id}/reminders`).set(as(bob)).expect(404);
    await api()
      .post(`/api/v1/entries/${entry.id}/reminders`)
      .set(as(bob))
      .send({ channel: 'push', offsetMinutes: -5 })
      .expect(404);
    await api().delete(`/api/v1/reminders/${r!.id}`).set(as(bob)).expect(404);
    expect((await prisma.reminder.findUniqueOrThrow({ where: { id: r!.id } })).status).toBe(
      'scheduled',
    );
  });
});
