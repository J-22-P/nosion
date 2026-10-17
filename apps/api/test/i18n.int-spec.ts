import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { createTestApp, STRONG_PASSWORD, uniqueEmail } from './helpers';

/** ข้อความที่ API ประกอบเองตามภาษาของผู้ใช้ (Phase 8 ขั้น 6 · สเปก 8.9) */
describe('i18n ของ API', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const ctx = await createTestApp();
    app = ctx.app;
    prisma = ctx.prisma;
  });

  afterAll(async () => {
    await app.close();
  });

  const api = () => request(app.getHttpServer());

  it('สมัครโดยเลือกภาษาอังกฤษ → settings.locale = en · ค่าเริ่มต้นปี พ.ศ. = true', async () => {
    const email = uniqueEmail('i18n-en');
    const res = await api()
      .post('/api/v1/auth/register')
      .send({ email, password: STRONG_PASSWORD, displayName: 'Jay', locale: 'en' })
      .expect(201);
    const me = await api()
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${res.body.accessToken}`)
      .expect(200);
    expect(me.body.settings).toMatchObject({ locale: 'en', buddhistEra: true });
    const settings = await prisma.userSettings.findFirstOrThrow({ where: { user: { email } } });
    expect(settings.locale).toBe('en');
  });

  it('ผู้ใช้ภาษาอังกฤษ → คำทักทาย การ์ด Today สรุปสัปดาห์ และ standup เป็นอังกฤษ', async () => {
    const res = await api()
      .post('/api/v1/auth/register')
      .send({
        email: uniqueEmail('i18n'),
        password: STRONG_PASSWORD,
        displayName: 'Jay',
        locale: 'en',
      })
      .expect(201);
    const auth = { Authorization: `Bearer ${res.body.accessToken}` };
    await api()
      .post('/api/v1/entries')
      .set(auth)
      .send({
        module: 'task',
        title: 'Write report',
        occurredAt: new Date().toISOString().slice(0, 10),
      })
      .expect(201);

    const today = await api().get('/api/v1/today').set(auth).expect(200);
    expect(today.body.greeting).toMatch(/^Good (morning|afternoon|evening), Jay$/);
    const task = (
      today.body.widgets as Array<{ module: string; title: string; headline: string }>
    ).find((w) => w.module === 'task');
    expect(task?.title).toBe("Today's tasks");
    // วันที่ UTC อาจเป็น "เมื่อวาน" ของกรุงเทพช่วงดึก → งานกลายเป็นเลยกำหนด (ต่อท้าย " · 1 overdue")
    expect(task?.headline).toMatch(/^1 task today/);

    const review = await api().get('/api/v1/review/weekly').set(auth).expect(200);
    const titles = (review.body.sections as Array<{ title: string }>).map((s) => s.title);
    expect(titles).toContain('Tasks');

    const standup = await api().get('/api/v1/tasks/standup/today').set(auth).expect(200);
    expect(standup.body.markdown).toContain('- None');

    // สลับกลับเป็นไทย → ข้อความตามทันที
    await api().patch('/api/v1/me/settings').set(auth).send({ locale: 'th' }).expect(200);
    const thai = await api().get('/api/v1/today').set(auth).expect(200);
    expect(thai.body.greeting).toMatch(/^สวัสดีตอน/);
  });
});
