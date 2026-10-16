import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { RedisService } from '../src/infra/redis/redis.service';
import { createTestApp, registerAndLogin, resetRateLimits } from './helpers';

/** วันของเดือนตามเวลาไทย — นาฬิกาจริงของเทสต์ไม่คงที่ จึงตรวจแบบสัมพัทธ์ */
const bangkokDay = (iso: string) =>
  Number(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Bangkok', day: 'numeric' }).format(
      new Date(iso),
    ),
  );

describe('NL Parser (/parse)', () => {
  let app: INestApplication;
  let redis: RedisService;
  let alice = '';

  beforeAll(async () => {
    const ctx = await createTestApp();
    app = ctx.app;
    redis = ctx.redis;
    alice = await registerAndLogin(app, 'alice-parse');
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetRateLimits(redis);
  });

  const api = () => request(app.getHttpServer());
  const as = (token: string) => ({ Authorization: `Bearer ${token}` });

  it('preview: รายจ่ายชนะ งานเป็นทางเลือกรอง · ไม่บันทึกอะไร', async () => {
    const res = await api()
      .post('/api/v1/parse')
      .set(as(alice))
      .send({ text: 'กาแฟ 65' })
      .expect(200);
    expect(res.body.best).toMatchObject({
      module: 'expense',
      title: 'กาแฟ',
      payload: { amountMinor: 6500, category: 'food' },
      rrule: null,
    });
    expect(res.body.alternatives).toEqual([
      expect.objectContaining({ module: 'task', title: 'กาแฟ 65' }),
    ]);
    expect(res.body.tokens).toEqual([{ kind: 'amount', raw: '65', start: 5, end: 7 }]);

    const list = await api().get('/api/v1/entries').set(as(alice)).expect(200);
    expect(list.body.data).toHaveLength(0);
  });

  it('DoD: "ค่าเน็ต 799 ทุกวันที่ 5" → บิลรายเดือน + การเตือน ครบในคำสั่งเดียว', async () => {
    const res = await api()
      .post('/api/v1/parse/commit')
      .set(as(alice))
      .send({ text: 'ค่าเน็ต 799 ทุกวันที่ 5' })
      .expect(201);

    expect(res.body.rule).toMatchObject({ rrule: 'FREQ=MONTHLY;BYMONTHDAY=5', endType: 'never' });
    expect(res.body.rule.template.reminders).toEqual([{ channel: 'push', offsetMinutes: -900 }]);
    const entry = res.body.entry;
    expect(entry).toMatchObject({
      module: 'expense',
      title: 'ค่าเน็ต',
      isAllDay: true,
      recurrenceRuleId: res.body.rule.id,
      payload: { amountMinor: 79900, isBill: true, costType: 'fixed', category: 'utilities' },
    });
    expect(bangkokDay(entry.occurredAt)).toBe(5);

    const reminders = await api()
      .get(`/api/v1/entries/${entry.id}/reminders`)
      .set(as(alice))
      .expect(200);
    expect(reminders.body).toEqual([
      expect.objectContaining({ channel: 'push', offsetMinutes: -900, status: 'scheduled' }),
    ]);
    // ล่วงหน้า 1 วัน 09:00 เวลาไทย = 02:00 UTC ของวันที่ 4
    expect(reminders.body[0].fireAt).toMatch(/-04T02:00:00\.000Z$/);
  });

  it('เลือกทางเลือกรอง + แท็ก/โปรเจกต์: ผูกของเดิมแบบไม่สนตัวพิมพ์ ไม่มีก็สร้าง', async () => {
    const project = await api()
      .post('/api/v1/projects')
      .set(as(alice))
      .send({ name: 'Home Office' })
      .expect(201);

    const res = await api()
      .post('/api/v1/parse/commit')
      .set(as(alice))
      .send({ text: 'ซื้อจอ 4500 พรุ่งนี้ #Gear +home-office', module: 'task' })
      .expect(201);

    expect(res.body.rule).toBeNull();
    expect(res.body.entry).toMatchObject({
      module: 'task',
      title: 'ซื้อจอ 4500',
      projectId: project.body.id,
      tags: [expect.objectContaining({ name: 'Gear' })],
    });

    // ครั้งที่สองใช้แท็กเดิม ไม่สร้างซ้ำ
    await api()
      .post('/api/v1/parse/commit')
      .set(as(alice))
      .send({ text: 'ติดตั้งจอ #gear' })
      .expect(201);
    const tags = await api().get('/api/v1/tags').set(as(alice)).expect(200);
    expect(tags.body.filter((t: { name: string }) => t.name.toLowerCase() === 'gear')).toHaveLength(
      1,
    );
  });

  it('งานมีเวลา → เตือนตอนนั้น · clientId ซ้ำไม่สร้างซ้ำ', async () => {
    const send = () =>
      api()
        .post('/api/v1/parse/commit')
        .set(as(alice))
        .send({ text: 'โทรหาลูกค้า พรุ่งนี้ บ่าย 2', clientId: 'cmdk-1' })
        .expect(201);
    const first = await send();
    const second = await send();
    expect(second.body.entry.id).toBe(first.body.entry.id);
    expect(first.body.entry.isAllDay).toBe(false);

    const reminders = await api()
      .get(`/api/v1/entries/${first.body.entry.id}/reminders`)
      .set(as(alice))
      .expect(200);
    expect(reminders.body).toEqual([expect.objectContaining({ offsetMinutes: 0 })]);
    expect(reminders.body[0].fireAt).toBe(first.body.entry.occurredAt);
  });

  it('เลือกโมดูลที่รับข้อความไม่ได้ → 422 · ข้อความว่าง → 422', async () => {
    await api()
      .post('/api/v1/parse/commit')
      .set(as(alice))
      .send({ text: 'ประชุมทีม', module: 'expense' })
      .expect(422);
    await api().post('/api/v1/parse').set(as(alice)).send({ text: '   ' }).expect(422);
  });

  it('รายจ่ายทั่วไปบันทึกเป็น done (เกิดขึ้นแล้ว) · บิลเป็น pending · payloadPatch แก้หมวดได้แต่ต้องผ่าน schema', async () => {
    const coffee = await api()
      .post('/api/v1/parse/commit')
      .set(as(alice))
      .send({ text: 'ขนมปัง 45', payloadPatch: { category: 'shopping' } })
      .expect(201);
    expect(coffee.body.entry).toMatchObject({
      module: 'expense',
      status: 'done',
      payload: { amountMinor: 4500, category: 'shopping' },
    });

    // หมวดที่ไม่มีจริง → 422 จาก payloadSchema ของโมดูล ไม่บันทึกอะไร
    await api()
      .post('/api/v1/parse/commit')
      .set(as(alice))
      .send({ text: 'ขนมปัง 45', payloadPatch: { category: 'pets' } })
      .expect(422);

    const preview = await api()
      .post('/api/v1/parse')
      .set(as(alice))
      .send({ text: 'ค่าน้ำ 150 ทุกเดือน' })
      .expect(200);
    expect(preview.body.best).toMatchObject({ module: 'expense', status: 'pending' });
  });

  it('ต้องล็อกอิน', async () => {
    await api().post('/api/v1/parse').send({ text: 'กาแฟ 65' }).expect(401);
  });
});
