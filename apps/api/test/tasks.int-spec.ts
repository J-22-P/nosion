import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { RedisService } from '../src/infra/redis/redis.service';
import { createTestApp, registerAndLogin, resetRateLimits } from './helpers';

const DAY = 24 * 60 * 60 * 1000;

describe('Task module endpoints', () => {
  let app: INestApplication;
  let redis: RedisService;
  let alice = '';
  let bob = '';

  beforeAll(async () => {
    const ctx = await createTestApp();
    app = ctx.app;
    redis = ctx.redis;
    alice = await registerAndLogin(app, 'alice-tasks');
    bob = await registerAndLogin(app, 'bob-tasks');
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetRateLimits(redis);
  });

  const api = () => request(app.getHttpServer());
  const as = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function createTask(token: string, body: Record<string, unknown>) {
    const res = await api()
      .post('/api/v1/entries')
      .set(as(token))
      .send({ module: 'task', ...body })
      .expect(201);
    return res.body as { id: string; version: number };
  }

  describe('GET /tasks/sidebar', () => {
    it('นับ smart list / โปรเจกต์ / แท็ก เฉพาะงานที่ยังไม่เสร็จของผู้ใช้คนนั้น', async () => {
      const project = await api()
        .post('/api/v1/projects')
        .set(as(alice))
        .send({ name: 'NOSION Core' })
        .expect(201);
      const emptyProject = await api()
        .post('/api/v1/projects')
        .set(as(alice))
        .send({ name: 'ว่าง' })
        .expect(201);
      const tag = await api().post('/api/v1/tags').set(as(alice)).send({ name: 'dev' }).expect(201);

      const now = Date.now();
      await createTask(alice, { title: 'inbox' }); // ไม่มีโปรเจกต์ ไม่มีวัน
      await createTask(alice, {
        title: 'เลยกำหนด',
        occurredAt: new Date(now - 2 * DAY).toISOString(),
        projectId: project.body.id,
        tagIds: [tag.body.id],
      });
      await createTask(alice, {
        title: 'อีก 3 วัน',
        occurredAt: new Date(now + 3 * DAY).toISOString(),
        projectId: project.body.id,
      });
      await createTask(alice, {
        title: 'อีก 30 วัน',
        occurredAt: new Date(now + 30 * DAY).toISOString(),
      });
      const done = await createTask(alice, { title: 'เสร็จแล้ว', tagIds: [tag.body.id] });
      await api().post(`/api/v1/entries/${done.id}/complete`).set(as(alice)).expect(201);

      // งานของ bob ต้องไม่ถูกนับรวม
      await createTask(bob, { title: 'ของ bob' });

      const res = await api().get('/api/v1/tasks/sidebar').set(as(alice)).expect(200);

      expect(res.body.smartLists).toEqual({
        all: 4,
        inbox: 1,
        today: 1, // เฉพาะที่เลยกำหนด (รวมใน "วันนี้")
        week: 1, // อีก 3 วัน — ที่เลยกำหนดอยู่ก่อนต้นวันนี้จึงไม่นับ
        overdue: 1,
      });
      expect(res.body.projects).toEqual([
        expect.objectContaining({ id: project.body.id, count: 2 }),
        expect.objectContaining({ id: emptyProject.body.id, count: 0 }),
      ]);
      // แท็กที่ติดกับงานที่เสร็จแล้วไม่นับ
      expect(res.body.topTags).toEqual([{ id: tag.body.id, name: 'dev', count: 1 }]);
    });

    it('ไม่ login → 401', async () => {
      await api().get('/api/v1/tasks/sidebar').expect(401);
    });
  });

  describe('GET /entries?inbox=true', () => {
    it('คืนเฉพาะงานที่ไม่มีโปรเจกต์และไม่มีวันกำหนด', async () => {
      const res = await api()
        .get('/api/v1/entries?module=task&inbox=true')
        .set(as(alice))
        .expect(200);
      const titles = (res.body.data as { title: string }[]).map((e) => e.title);
      expect(titles).toContain('inbox');
      expect(titles).not.toContain('อีก 30 วัน');
    });
  });

  describe('PATCH status (undo)', () => {
    it('เปิดงานที่เสร็จแล้วกลับมาทำ ต้องล้าง completedAt', async () => {
      const task = await createTask(alice, { title: 'จะ undo' });
      const completed = await api()
        .post(`/api/v1/entries/${task.id}/complete`)
        .set(as(alice))
        .expect(201);
      expect(completed.body.completedAt).not.toBeNull();

      const reopened = await api()
        .patch(`/api/v1/entries/${task.id}`)
        .set(as(alice))
        .send({ status: 'pending', version: completed.body.version })
        .expect(200);
      expect(reopened.body.status).toBe('pending');
      expect(reopened.body.completedAt).toBeNull();
    });
  });
});
