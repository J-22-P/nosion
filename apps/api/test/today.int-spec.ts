import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { RedisService } from '../src/infra/redis/redis.service';
import { createTestApp, registerAndLogin, resetRateLimits } from './helpers';

const DAY = 24 * 60 * 60 * 1000;

/**
 * GET /today + GET /tasks/standup/today
 * เวลา "ตอนนี้" เป็นของจริง → ข้อมูลเลือกให้ไม่ข้ามขอบวัน: "ตอนนี้" อยู่ในวันนี้เสมอ, 3 วันก่อนเป็นวันก่อนเสมอ
 */
describe('Today', () => {
  let app: INestApplication;
  let redis: RedisService;
  let carol = '';
  let dave = '';

  beforeAll(async () => {
    const ctx = await createTestApp();
    app = ctx.app;
    redis = ctx.redis;
    carol = await registerAndLogin(app, 'carol-today');
    dave = await registerAndLogin(app, 'dave-today');
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetRateLimits(redis);
  });

  const api = () => request(app.getHttpServer());
  const as = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function create(token: string, body: Record<string, unknown>) {
    const res = await api().post('/api/v1/entries').set(as(token)).send(body).expect(201);
    return res.body as { id: string };
  }

  it('ผู้ใช้ใหม่: การ์ดของทุกโมดูลที่เปิด เรียงตาม order · ว่าง = empty state · ไม่มีโมดูลไหนล้ม', async () => {
    const res = await api().get('/api/v1/today').set(as(carol)).expect(200);
    expect(res.body.timezone).toBe('Asia/Bangkok');
    expect(res.body.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(res.body.greeting).toMatch(/^สวัสดีตอน(เช้า|บ่าย|เย็น) carol-today$/);
    expect(res.body.widgets.map((w: { module: string }) => w.module)).toEqual(['task', 'expense']);
    expect(res.body.widgets.every((w: { isEmpty: boolean }) => w.isEmpty)).toBe(true);
    expect(res.body.failedModules).toEqual([]);
  });

  it('การ์ดงาน: วันนี้ + เลยกำหนด + เสร็จวันนี้ · การ์ดเงิน: ใช้วันนี้ · ไม่ปนข้อมูลของคนอื่น', async () => {
    const now = Date.now();
    // 23:59 ของวันนี้ตามเวลาไทย — ถ้าใช้ "ตอนนี้" งานจะเลยกำหนดทันทีที่เวลาผ่านไป 1 ms (isOverdue เทียบเวลาจริง)
    const todayBkk = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(now);
    await create(carol, {
      module: 'task',
      title: 'งานวันนี้',
      occurredAt: `${todayBkk}T23:59:00+07:00`,
    });
    await create(carol, {
      module: 'task',
      title: 'งานเลยกำหนด',
      occurredAt: new Date(now - 3 * DAY).toISOString(),
    });
    const finished = await create(carol, { module: 'task', title: 'ปิดแล้ว' });
    await api().post(`/api/v1/entries/${finished.id}/complete`).set(as(carol)).expect(201);
    await create(carol, {
      module: 'task',
      title: 'สัปดาห์หน้า',
      occurredAt: new Date(now + 8 * DAY).toISOString(),
    });
    await create(carol, {
      module: 'expense',
      title: 'กาแฟ',
      status: 'done',
      occurredAt: new Date(now).toISOString(),
      payload: { amountMinor: 6500, category: 'food' },
    });
    await create(dave, {
      module: 'task',
      title: 'ของเดฟ',
      occurredAt: new Date(now).toISOString(),
    });

    const res = await api().get('/api/v1/today').set(as(carol)).expect(200);
    const task = res.body.widgets.find((w: { module: string }) => w.module === 'task');
    const expense = res.body.widgets.find((w: { module: string }) => w.module === 'expense');

    expect(task.headline).toBe('งานวันนี้ 3 ชิ้น · เลยกำหนด 1');
    expect(task.progress).toEqual({ done: 1, total: 3 });
    const titles = task.items.map((i: { title: string }) => i.title);
    expect(titles).toEqual(expect.arrayContaining(['งานวันนี้', 'งานเลยกำหนด']));
    expect(titles).not.toContain('สัปดาห์หน้า');
    expect(titles).not.toContain('ของเดฟ');

    expect(expense.data.todaySpentMinor).toBe(6500);
    expect(expense.headline).toMatch(/^วันนี้ใช้ ฿65 · เดือนนี้ ฿/);
    expect(expense.isEmpty).toBe(false);
  });

  it('ปิดโมดูลใน settings → การ์ดนั้นหายจาก /today (วนตาม enabledModules)', async () => {
    await api()
      .patch('/api/v1/me/settings')
      .set(as(dave))
      .send({ enabledModules: ['task'] })
      .expect(200);
    const res = await api().get('/api/v1/today').set(as(dave)).expect(200);
    expect(res.body.widgets.map((w: { module: string }) => w.module)).toEqual(['task']);
  });

  it('standup: Done / Doing / Blocked (#blocked) · ?format=markdown คืน text/markdown', async () => {
    const tag = await api()
      .post('/api/v1/tags')
      .set(as(carol))
      .send({ name: 'blocked' })
      .expect(201);
    await create(carol, {
      module: 'task',
      title: 'รอ infra',
      occurredAt: new Date().toISOString(),
      tagIds: [tag.body.id],
    });

    const json = await api().get('/api/v1/tasks/standup/today').set(as(carol)).expect(200);
    const titles = (k: 'done' | 'doing' | 'blocked') =>
      json.body[k].map((i: { title: string }) => i.title);
    expect(titles('done')).toEqual(['ปิดแล้ว']);
    expect(titles('doing')).toEqual(expect.arrayContaining(['งานวันนี้', 'งานเลยกำหนด']));
    expect(titles('doing')).not.toContain('สัปดาห์หน้า');
    expect(json.body.blocked).toEqual([
      { id: expect.any(String), title: 'รอ infra', note: '#blocked' },
    ]);

    const md = await api()
      .get('/api/v1/tasks/standup/today?format=markdown')
      .set(as(carol))
      .expect(200);
    expect(md.headers['content-type']).toContain('text/markdown');
    expect(md.text).toBe(json.body.markdown);
    expect(md.text).toContain('**Blocked**\n- รอ infra _(#blocked)_');
  });
});
