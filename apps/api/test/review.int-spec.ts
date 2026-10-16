import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { RedisService } from '../src/infra/redis/redis.service';
import { createTestApp, registerAndLogin, resetRateLimits } from './helpers';

interface Section {
  module: string;
  stats: { label: string; value: string }[];
  highlights: string[];
}

/** Weekly Review (Phase 6) — ทุกโมดูลที่เปิด รวมนิสัย โดย review.service.ts ไม่รู้จักโมดูลไหนเลย */
describe('Weekly Review (/review/weekly)', () => {
  let app: INestApplication;
  let redis: RedisService;
  let alice = '';

  beforeAll(async () => {
    const ctx = await createTestApp();
    app = ctx.app;
    redis = ctx.redis;
    alice = await registerAndLogin(app, 'alice-review');
    const api = request(app.getHttpServer());
    const as = { Authorization: `Bearer ${alice}` };
    await api
      .patch('/api/v1/me/settings')
      .set(as)
      .send({ enabledModules: ['task', 'expense', 'habit'] });
    const task = await api.post('/api/v1/parse/commit').set(as).send({ text: 'ส่งรายงาน วันนี้' });
    await api.post(`/api/v1/entries/${task.body.entry.id}/complete`).set(as);
    await api.post('/api/v1/parse/commit').set(as).send({ text: 'กาแฟ 65' });
    const habit = await api
      .post('/api/v1/parse/commit')
      .set(as)
      .send({ text: 'ดื่มน้ำ 8 แก้ว ทุกวัน' });
    await api.post(`/api/v1/habits/${habit.body.entry.id}/check`).set(as).send({ done: true });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetRateLimits(redis);
  });

  const api = () => request(app.getHttpServer());
  const as = (token: string) => ({ Authorization: `Bearer ${token}` });

  it('สัปดาห์นี้: ทุกโมดูลที่เปิดมีส่วนของตัวเอง เรียงตาม order', async () => {
    const res = await api().get('/api/v1/review/weekly').set(as(alice)).expect(200);
    expect(res.body.week).toMatch(/^\d{4}-W\d{2}$/);
    expect(res.body.failedModules).toEqual([]);
    const sections = res.body.sections as Section[];
    expect(sections.map((s) => s.module)).toEqual(['task', 'expense', 'habit']);
    expect(sections[0]!.stats[0]).toEqual({ label: 'ทำเสร็จ', value: '1/1' });
    expect(sections[1]!.stats[0]).toEqual({ label: 'รายจ่าย', value: '฿65' });
    expect(sections[2]!.stats).toContainEqual({ label: 'ทำสำเร็จ', value: '1/1' });
  });

  it('สัปดาห์ก่อนว่าง · previous/next ต่อกันได้ · สัปดาห์ผิดรูปแบบ/ไม่มีจริง → 422', async () => {
    const now = (await api().get('/api/v1/review/weekly').set(as(alice)).expect(200)).body;
    const prev = await api()
      .get(`/api/v1/review/weekly?week=${now.previousWeek}`)
      .set(as(alice))
      .expect(200);
    expect(prev.body.nextWeek).toBe(now.week);
    expect(
      (prev.body.sections as Section[]).find((s) => s.module === 'task')!.stats[0]!.value,
    ).toBe('0/0');

    await api().get('/api/v1/review/weekly?week=2026-42').set(as(alice)).expect(422);
    await api().get('/api/v1/review/weekly?week=2027-W53').set(as(alice)).expect(422);
  });
});
