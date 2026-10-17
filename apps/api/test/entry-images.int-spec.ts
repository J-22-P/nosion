import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { RedisService } from '../src/infra/redis/redis.service';
import { createTestApp, registerAndLogin, resetRateLimits } from './helpers';

/** WebP ขั้นต่ำที่ผ่านการตรวจหัวไฟล์ ("RIFF" ···· "WEBP") — เนื้อในไม่ต้องเป็นรูปจริงสำหรับเทสต์นี้ */
const fakeWebp = (tag: string) =>
  Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 '), Buffer.from(tag)]);
const SRC = 'https://github.com/user-attachments/assets/98cb028f-3a3d-45cb-a534-a53b897c6065';
const SRC2 = 'https://github.com/user-attachments/assets/6a989651-a0fc-486a-a308-0acf93557931';

describe('รูปย่อในรายละเอียดงาน (/entries/:id/images)', () => {
  let app: INestApplication;
  let redis: RedisService;
  let alice = '';
  let bob = '';
  let entryId = '';

  const api = () => request(app.getHttpServer());
  const as = (token: string) => ({ Authorization: `Bearer ${token}` });
  const put = (token: string, id: string, sourceUrl: string, data: Buffer) =>
    api()
      .put(`/api/v1/entries/${id}/images`)
      .set(as(token))
      .send({ sourceUrl, data: data.toString('base64'), width: 800, height: 450 });

  beforeAll(async () => {
    const ctx = await createTestApp();
    app = ctx.app;
    redis = ctx.redis;
    alice = await registerAndLogin(app, 'alice-images');
    bob = await registerAndLogin(app, 'bob-images');
    const res = await api()
      .post('/api/v1/entries')
      .set(as(alice))
      .send({ module: 'task', title: 'ฟอร์มชดเชยอากร', description: `![](${SRC})` })
      .expect(201);
    entryId = res.body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetRateLimits(redis);
  });

  it('ส่งรูปย่อ → ได้ URL มีลายเซ็น · เปิดได้โดยไม่ล็อกอิน · header กันเดาชนิดไฟล์ · ส่งซ้ำ = แทนที่', async () => {
    const first = await put(alice, entryId, SRC, fakeWebp('one')).expect(200);
    expect(first.body).toMatchObject({ entryId, sourceUrl: SRC, width: 800, height: 450 });
    expect(first.body.url).toMatch(/\/api\/v1\/entry-images\/[\w-]+\/[\w-]{32}\.webp$/);

    const path = new URL(first.body.url).pathname;
    const file = await api().get(path).expect(200);
    expect(file.headers['content-type']).toBe('image/webp');
    expect(file.headers['x-content-type-options']).toBe('nosniff');
    expect(file.headers['content-security-policy']).toContain("default-src 'none'");
    expect(Buffer.from(file.body).toString('latin1')).toContain('one');

    const again = await put(alice, entryId, SRC, fakeWebp('two')).expect(200);
    expect(again.body.url).toBe(first.body.url);
    const list = await api().get(`/api/v1/entries/${entryId}/images`).set(as(alice)).expect(200);
    expect(list.body).toHaveLength(1);
    expect(Buffer.from((await api().get(path).expect(200)).body).toString('latin1')).toContain(
      'two',
    );
  });

  it('ลายเซ็นผิด / id มั่ว → 404 เหมือนกัน', async () => {
    const [img] = (await api().get(`/api/v1/entries/${entryId}/images`).set(as(alice))).body;
    const path = new URL(img.url).pathname;
    await api()
      .get(path.replace(/\/[\w-]{32}\.webp$/, `/${'x'.repeat(32)}.webp`))
      .expect(404);
    await api()
      .get(`/api/v1/entry-images/nope/${'x'.repeat(32)}.webp`)
      .expect(404);
  });

  it('งานของคนอื่น: ส่ง/อ่านรายการไม่ได้ (404) · รายการรวมของ bob ไม่มีรูปของ alice', async () => {
    await put(bob, entryId, SRC2, fakeWebp('bob')).expect(404);
    await api().get(`/api/v1/entries/${entryId}/images`).set(as(bob)).expect(404);
    const all = await api().get('/api/v1/entry-images').set(as(bob)).expect(200);
    expect(all.body).toEqual([]);
  });

  it('ไม่ใช่ WebP → 400 · sourceUrl ไม่ใช่ https → 422 (ไม่ผ่าน schema)', async () => {
    await put(alice, entryId, SRC2, Buffer.from('<svg onload="alert(1)"></svg>')).expect(400);
    await put(alice, entryId, 'http://example.com/a.png', fakeWebp('x')).expect(422);
  });

  it('prune เก็บเฉพาะรูปที่ยังอยู่ใน description · ลบงานแล้ว URL รูปเปิดไม่ได้', async () => {
    await put(alice, entryId, SRC2, fakeWebp('second')).expect(200);
    const all = await api().get('/api/v1/entry-images').set(as(alice)).expect(200);
    expect(all.body.map((i: { sourceUrl: string }) => i.sourceUrl).sort()).toEqual(
      [SRC, SRC2].sort(),
    );

    const pruned = await api()
      .post(`/api/v1/entries/${entryId}/images/prune`)
      .set(as(alice))
      .send({ keep: [SRC] })
      .expect(200);
    expect(pruned.body).toEqual({ deleted: 1 });

    const [img] = (await api().get(`/api/v1/entries/${entryId}/images`).set(as(alice))).body;
    await api().delete(`/api/v1/entries/${entryId}`).set(as(alice)).expect(204);
    await api().get(new URL(img.url).pathname).expect(404);
  });
});
