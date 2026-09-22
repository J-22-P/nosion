import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, STRONG_PASSWORD, uniqueEmail } from './helpers';

describe('Entries CRUD + IDOR', () => {
  let app: INestApplication;
  let alice = '';
  let bob = '';

  beforeAll(async () => {
    const ctx = await createTestApp();
    app = ctx.app;
    alice = await registerUser(app, 'alice');
    bob = await registerUser(app, 'bob');
  });

  afterAll(async () => {
    await app.close();
  });

  const api = () => request(app.getHttpServer());

  it('สร้าง → อ่าน → แก้ไข → ทำเสร็จ → ลบ → กู้คืน', async () => {
    const created = await api()
      .post('/api/v1/entries')
      .set('Authorization', `Bearer ${alice}`)
      .send({ module: 'task', title: 'เขียนเทสต์', payload: { estimateMinutes: 30 } })
      .expect(201);

    const id = created.body.id as string;
    expect(created.body.version).toBe(1);
    expect(created.body.payload.estimateMinutes).toBe(30);
    // payload ถูกเติม default จาก Zod ของโมดูล ไม่ใช่เก็บดิบ ๆ ตามที่ส่งมา
    expect(created.body.payload.deferCount).toBe(0);

    const updated = await api()
      .patch(`/api/v1/entries/${id}`)
      .set('Authorization', `Bearer ${alice}`)
      .send({ title: 'เขียนเทสต์ให้ครบ', version: 1 })
      .expect(200);
    expect(updated.body.title).toBe('เขียนเทสต์ให้ครบ');
    expect(updated.body.version).toBe(2);

    // ส่ง version เก่าซ้ำ = แพ้การแข่ง → 409 ไม่ใช่เขียนทับเงียบ ๆ
    const conflict = await api()
      .patch(`/api/v1/entries/${id}`)
      .set('Authorization', `Bearer ${alice}`)
      .send({ title: 'ทับของคนอื่น', version: 1 })
      .expect(409);
    expect(conflict.body.type).toContain('version-conflict');

    const completed = await api()
      .post(`/api/v1/entries/${id}/complete`)
      .set('Authorization', `Bearer ${alice}`)
      .expect(201);
    expect(completed.body.status).toBe('done');
    expect(completed.body.completedAt).toBeTruthy();

    await api().delete(`/api/v1/entries/${id}`).set('Authorization', `Bearer ${alice}`).expect(204);

    const trash = await api()
      .get('/api/v1/entries/trash')
      .set('Authorization', `Bearer ${alice}`)
      .expect(200);
    expect(trash.body.data.some((e: { id: string }) => e.id === id)).toBe(true);

    const restored = await api()
      .post(`/api/v1/entries/${id}/restore`)
      .set('Authorization', `Bearer ${alice}`)
      .expect(201);
    expect(restored.body.deletedAt).toBeNull();
  });

  it('payload ที่ผิด schema ของโมดูล → 422 พร้อมชี้ path ที่ผิด', async () => {
    const res = await api()
      .post('/api/v1/entries')
      .set('Authorization', `Bearer ${alice}`)
      .send({ module: 'task', title: 'ผิด', payload: { estimateMinutes: -5 } })
      .expect(422);
    expect(res.body.errors?.[0]?.path).toContain('payload.estimateMinutes');
  });

  it('IDOR: bob เข้าถึงรายการของ alice ไม่ได้เลยไม่ว่าจะอ่าน แก้ หรือลบ', async () => {
    const created = await api()
      .post('/api/v1/entries')
      .set('Authorization', `Bearer ${alice}`)
      .send({ module: 'task', title: 'ความลับของ alice' })
      .expect(201);
    const id = created.body.id as string;

    await api().get(`/api/v1/entries/${id}`).set('Authorization', `Bearer ${bob}`).expect(404);
    await api()
      .patch(`/api/v1/entries/${id}`)
      .set('Authorization', `Bearer ${bob}`)
      .send({ title: 'แก้ของคนอื่น', version: 1 })
      .expect(404);
    await api().delete(`/api/v1/entries/${id}`).set('Authorization', `Bearer ${bob}`).expect(404);

    // รายการของ alice ต้องไม่โผล่ในลิสต์ของ bob
    const bobList = await api()
      .get('/api/v1/entries')
      .set('Authorization', `Bearer ${bob}`)
      .expect(200);
    expect(bobList.body.data.some((e: { id: string }) => e.id === id)).toBe(false);
  });

  it('เลื่อนงานเพิ่ม deferCount ไว้ทำสถิติ', async () => {
    const created = await api()
      .post('/api/v1/entries')
      .set('Authorization', `Bearer ${alice}`)
      .send({ module: 'task', title: 'งานที่จะถูกผัด', occurredAt: '2026-09-18' })
      .expect(201);

    const deferred = await api()
      .post(`/api/v1/entries/${created.body.id}/defer?to=tomorrow`)
      .set('Authorization', `Bearer ${alice}`)
      .expect(201);

    expect(deferred.body.payload.deferCount).toBe(1);
    expect(new Date(deferred.body.occurredAt).getTime()).toBeGreaterThan(
      new Date(created.body.occurredAt).getTime(),
    );
  });

  it('clientId เดิมยิงซ้ำ ไม่สร้างรายการซ้ำ (idempotent สำหรับ offline sync)', async () => {
    const body = { module: 'task', title: 'งานจากมือถือตอนออฟไลน์', clientId: 'local-abc-123' };
    const first = await api()
      .post('/api/v1/entries')
      .set('Authorization', `Bearer ${alice}`)
      .send(body)
      .expect(201);
    const second = await api()
      .post('/api/v1/entries')
      .set('Authorization', `Bearer ${alice}`)
      .send(body)
      .expect(201);
    expect(second.body.id).toBe(first.body.id);
  });
});

async function registerUser(app: INestApplication, prefix: string): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/api/v1/auth/register')
    .send({ email: uniqueEmail(prefix), password: STRONG_PASSWORD, displayName: prefix })
    .expect(201);
  return res.body.accessToken as string;
}
