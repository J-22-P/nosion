import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { RedisService } from '../src/infra/redis/redis.service';
import { createTestApp, registerAndLogin, resetRateLimits } from './helpers';

const bkk = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());

interface HabitBody {
  ruleId: string;
  title: string;
  kind: string;
  today: { entryId: string; currentValue: number; status: string } | null;
  streak: { current: number; longest: number; unit: string };
  last7: { date: string; state: string }[];
  weekProgress: { done: number; target: number } | null;
}

/**
 * Phase 6 — โมดูลที่สามเข้าระบบโดยไม่แก้ core: เปิดโมดูลในการตั้งค่าแล้ว
 * ⌘K (/parse), Today, ปฏิทิน และ /entries รู้จักนิสัยเองทั้งหมด
 */
describe('Habit module', () => {
  let app: INestApplication;
  let redis: RedisService;
  let alice = '';
  let bob = '';

  beforeAll(async () => {
    const ctx = await createTestApp();
    app = ctx.app;
    redis = ctx.redis;
    alice = await registerAndLogin(app, 'alice-habit');
    bob = await registerAndLogin(app, 'bob-habit');
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetRateLimits(redis);
  });

  const api = () => request(app.getHttpServer());
  const as = (token: string) => ({ Authorization: `Bearer ${token}` });
  const habits = async (token: string) =>
    (await api().get('/api/v1/habits').set(as(token)).expect(200)).body.habits as HabitBody[];

  it('ปิดโมดูลอยู่ (ค่าเริ่มต้น) → parser ไม่เสนอนิสัย · เปิดแล้วเสนอ', async () => {
    const before = await api()
      .post('/api/v1/parse')
      .set(as(alice))
      .send({ text: 'ดื่มน้ำ 8 แก้ว ทุกวัน' })
      .expect(200);
    expect(before.body.best.module).toBe('task');

    await api()
      .patch('/api/v1/me/settings')
      .set(as(alice))
      .send({ enabledModules: ['task', 'expense', 'habit'] })
      .expect(200);
    const after = await api()
      .post('/api/v1/parse')
      .set(as(alice))
      .send({ text: 'ดื่มน้ำ 8 แก้ว ทุกวัน' })
      .expect(200);
    expect(after.body.best).toMatchObject({
      module: 'habit',
      title: 'ดื่มน้ำ',
      rrule: 'FREQ=DAILY',
      payload: { kind: 'count', targetValue: 8, unit: 'แก้ว' },
    });
  });

  it('สร้างจาก ⌘K → นิสัยรายวัน · รอบวันนี้พร้อม · +1 ถึงเป้า = done · −1 ไม่ต่ำกว่า 0', async () => {
    await api()
      .post('/api/v1/parse/commit')
      .set(as(alice))
      .send({ text: 'ดื่มน้ำ 8 แก้ว ทุกวัน' })
      .expect(201);
    const [water] = await habits(alice);
    expect(water).toMatchObject({
      title: 'ดื่มน้ำ',
      kind: 'count',
      streak: { current: 0, unit: 'day' },
    });
    expect(water!.today).toMatchObject({ currentValue: 0, status: 'pending' });
    expect(water!.last7.at(-1)).toEqual({ date: bkk(), state: 'pending' });

    const id = water!.today!.entryId;
    const dec = await api()
      .post(`/api/v1/habits/${id}/increment`)
      .set(as(alice))
      .send({ delta: -1 })
      .expect(200);
    expect(dec.body.currentValue).toBe(0);

    // +1 พร้อมกัน 8 ครั้ง — optimistic concurrency + retry ไม่ทำให้นับหาย
    await Promise.all(
      Array.from({ length: 8 }, () =>
        api().post(`/api/v1/habits/${id}/increment`).set(as(alice)).send({ delta: 1 }),
      ),
    );
    const [done] = await habits(alice);
    expect(done!.today).toMatchObject({ currentValue: 8, status: 'done' });
    expect(done!.streak).toMatchObject({ current: 1, longest: 1 });
    expect(done!.last7.at(-1)!.state).toBe('done');
  });

  it('check · Today · ปฏิทิน รู้จักนิสัยโดยไม่แก้โค้ดของหน้าเหล่านั้น', async () => {
    await api()
      .post('/api/v1/parse/commit')
      .set(as(alice))
      .send({ text: 'อ่านหนังสือ ทุกวัน', module: 'habit' })
      .expect(201);
    const read = (await habits(alice)).find((h) => h.title === 'อ่านหนังสือ')!;
    await api()
      .post(`/api/v1/habits/${read.today!.entryId}/check`)
      .set(as(alice))
      .send({ done: true })
      .expect(200);

    const today = await api().get('/api/v1/today').set(as(alice)).expect(200);
    const widget = today.body.widgets.find((w: { module: string }) => w.module === 'habit');
    expect(widget).toMatchObject({ headline: 'ทำแล้ว 2 จาก 2', progress: { done: 2, total: 2 } });

    const cal = await api()
      .get(`/api/v1/calendar?from=${bkk()}&to=${bkk()}`)
      .set(as(alice))
      .expect(200);
    expect(cal.body.countsByModule.habit).toBe(2);
    expect(cal.body.events.map((e: { title: string }) => e.title)).toContain('ดื่มน้ำ 8/8 แก้ว');
  });

  it('นิสัยรายสัปดาห์ "วิ่ง 3 ครั้งต่อสัปดาห์" → weekProgress · ของคนอื่นแตะไม่ได้', async () => {
    await api()
      .post('/api/v1/parse/commit')
      .set(as(alice))
      .send({ text: 'วิ่ง 3 ครั้งต่อสัปดาห์', module: 'habit' })
      .expect(201);
    const run = (await habits(alice)).find((h) => h.title === 'วิ่ง')!;
    expect(run).toMatchObject({ streak: { unit: 'week' }, weekProgress: { done: 0, target: 3 } });

    await api()
      .post(`/api/v1/habits/${run.today!.entryId}/check`)
      .set(as(bob))
      .send({ done: true })
      .expect(404);
    expect(await habits(bob)).toEqual([]);
  });

  it('ค่าผิด → 422', async () => {
    const [water] = await habits(alice);
    await api()
      .post(`/api/v1/habits/${water!.today!.entryId}/increment`)
      .set(as(alice))
      .send({ delta: 5 })
      .expect(422);
  });

  it('บัญชี demo: เปิดโมดูลนิสัยไว้ · 4 นิสัยพร้อม streak ตามประวัติ', async () => {
    const demo = await api().post('/api/v1/auth/demo').expect(200);
    const list = await habits(demo.body.accessToken);
    expect(list.map((h) => [h.title, h.streak.current])).toEqual([
      ['ดื่มน้ำ', 4],
      ['อ่านหนังสือ', 15],
      ['นอน', 2], // วันนี้ยังไม่ทำ (ไม่ตัด) · 2 วันก่อนทำ · ก่อนหน้านั้นพลาด
      ['วิ่ง', expect.any(Number)],
    ]);
    expect(list[0]!.today).toMatchObject({ currentValue: 5, status: 'pending' });
    const today = await api().get('/api/v1/today').set(as(demo.body.accessToken)).expect(200);
    expect(today.body.widgets.map((w: { module: string }) => w.module)).toContain('habit');
  });
});
