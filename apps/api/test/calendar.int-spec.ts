import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { RedisService } from '../src/infra/redis/redis.service';
import { createTestApp, registerAndLogin, resetRateLimits } from './helpers';

const DAY = 24 * 60 * 60 * 1000;
/** 'YYYY-MM-DD' ตามเวลาไทย N วันจากวันนี้ — เทสต์ใช้นาฬิกาจริง */
const bkk = (offsetDays = 0) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(
    new Date(Date.now() + offsetDays * DAY),
  );

interface EventBody {
  entryId: string | null;
  module: string;
  title: string;
  date: string;
  projected: boolean;
  hasReminder: boolean;
  actions: { kind: string; label: string; presentation?: string }[];
}

describe('Calendar (/calendar)', () => {
  let app: INestApplication;
  let redis: RedisService;
  let alice = '';
  let bob = '';

  beforeAll(async () => {
    const ctx = await createTestApp();
    app = ctx.app;
    redis = ctx.redis;
    alice = await registerAndLogin(app, 'alice-calendar');
    bob = await registerAndLogin(app, 'bob-calendar');

    const as = { Authorization: `Bearer ${alice}` };
    const api = request(app.getHttpServer());
    await api
      .post('/api/v1/entries')
      .set(as)
      .send({ module: 'task', title: 'ส่งรายงาน', occurredAt: bkk(1) })
      .expect(201);
    // รายจ่ายจรไม่ขึ้นปฏิทิน (สเปก 6.3)
    await api.post('/api/v1/parse/commit').set(as).send({ text: 'กาแฟ 65' }).expect(201);
    await api
      .post('/api/v1/parse/commit')
      .set(as)
      .send({ text: 'ค่าเน็ต 799 ทุกวันที่ 5' })
      .expect(201);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetRateLimits(redis);
  });

  const api = () => request(app.getHttpServer());
  const as = (token: string) => ({ Authorization: `Bearer ${token}` });
  const calendar = (token: string, from: string, to: string, extra = '') =>
    api().get(`/api/v1/calendar?from=${from}&to=${to}${extra}`).set(as(token));

  it('รวมทุกโมดูลในคำขอเดียว · ปุ่มตามโมดูล · บิลมีการเตือน · Server-Timing', async () => {
    const res = await calendar(alice, bkk(0), bkk(60)).expect(200);
    const events = res.body.events as EventBody[];

    const task = events.find((e) => e.module === 'task')!;
    expect(task).toMatchObject({ title: 'ส่งรายงาน', date: bkk(1), projected: false });
    expect(task.actions).toEqual([
      { kind: 'complete', label: 'ทำเสร็จ', presentation: 'checkbox' },
    ]);

    const bills = events.filter((e) => e.module === 'expense');
    expect(bills.length).toBeGreaterThanOrEqual(1);
    for (const bill of bills) {
      expect(bill.title).toMatch(/^ค่าเน็ต · /);
      expect(bill.date.endsWith('-05')).toBe(true);
      expect(bill.hasReminder).toBe(true);
      expect(bill.actions).toEqual([
        { kind: 'complete', label: 'จ่ายแล้ว', presentation: 'button' },
      ]);
    }
    expect(events.some((e) => e.title.startsWith('กาแฟ'))).toBe(false);

    expect(res.body.countsByModule).toEqual({ task: 1, expense: bills.length });
    expect(res.body.reminders.length).toBe(bills.length);
    expect(res.headers['server-timing']).toMatch(/^calendar;dur=\d+(\.\d)?$/);
  });

  it('?module= กรองเฉพาะ events แต่ countsByModule ยังนับครบ', async () => {
    const res = await calendar(alice, bkk(0), bkk(60), '&module=task').expect(200);
    expect(res.body.events.map((e: EventBody) => e.module)).toEqual(['task']);
    expect(res.body.countsByModule.expense).toBeGreaterThanOrEqual(1);
  });

  it('เลย horizon 90 วัน → รอบบิลยังขึ้นเป็น projected (ยังกดไม่ได้) โดยไม่เขียน DB', async () => {
    const res = await calendar(alice, bkk(100), bkk(140)).expect(200);
    const bills = (res.body.events as EventBody[]).filter((e) => e.module === 'expense');
    expect(bills.length).toBeGreaterThanOrEqual(1);
    for (const bill of bills) {
      expect(bill).toMatchObject({ entryId: null, projected: true, actions: [] });
      expect(bill.date.endsWith('-05')).toBe(true);
    }

    const stored = await api()
      .get(`/api/v1/entries?module=expense&from=${bkk(100)}&to=${bkk(140)}`)
      .set(as(alice))
      .expect(200);
    expect(stored.body.data).toHaveLength(0);
  });

  it('เห็นเฉพาะของตัวเอง', async () => {
    const res = await calendar(bob, bkk(0), bkk(60)).expect(200);
    expect(res.body.events).toEqual([]);
    expect(res.body.countsByModule).toEqual({ task: 0, expense: 0 });
  });

  it('ช่วงผิด → 422 (to ก่อน from · เกิน 93 วัน · ไม่ใช่วันที่)', async () => {
    await calendar(alice, bkk(5), bkk(1)).expect(422);
    await calendar(alice, bkk(0), bkk(93)).expect(422);
    await calendar(alice, 'today', bkk(1)).expect(422);
  });

  describe('iCal feed', () => {
    it('ลิงก์ → .ics ที่ subscribe ได้ ไม่ต้องล็อกอิน', async () => {
      const feed = await api().get('/api/v1/calendar/feed').set(as(alice)).expect(200);
      expect(feed.body.url).toMatch(/\/api\/v1\/calendar\/[\w-]+\.ics$/);
      expect(feed.body.webcalUrl).toMatch(/^webcal:\/\//);

      const path = new URL(feed.body.url).pathname;
      const res = await api().get(path).expect(200);
      expect(res.headers['content-type']).toMatch(/^text\/calendar/);
      expect(res.text.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
      expect(res.text).toContain('SUMMARY:ส่งรายงาน');
      expect(res.text).toMatch(/SUMMARY:ค่าเน็ต/);
      expect(res.text).not.toContain('กาแฟ');
    });

    it('rotate → ลิงก์เดิมใช้ไม่ได้ทันที · token มั่วได้ 404 เหมือนกัน', async () => {
      const before = await api().get('/api/v1/calendar/feed').set(as(alice)).expect(200);
      const rotated = await api().post('/api/v1/calendar/feed/rotate').set(as(alice)).expect(200);
      expect(rotated.body.url).not.toBe(before.body.url);

      await api().get(new URL(before.body.url).pathname).expect(404);
      await api().get(new URL(rotated.body.url).pathname).expect(200);
      await api().get('/api/v1/calendar/not-a-real-token-at-all-xx.ics').expect(404);
      await api().get('/api/v1/calendar/x.ics').expect(404);
    });

    it('feed ของ bob ไม่มีรายการของ alice', async () => {
      const feed = await api().get('/api/v1/calendar/feed').set(as(bob)).expect(200);
      const res = await api().get(new URL(feed.body.url).pathname).expect(200);
      expect(res.text).not.toContain('BEGIN:VEVENT');
    });
  });
});
