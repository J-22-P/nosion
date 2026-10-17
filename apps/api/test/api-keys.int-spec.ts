import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { RedisService } from '../src/infra/redis/redis.service';
import { createTestApp, registerAndLogin, resetRateLimits } from './helpers';

describe('API key + Public API (Phase 8 ขั้น 4)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: RedisService;
  let token: string;

  beforeAll(async () => {
    const ctx = await createTestApp();
    app = ctx.app;
    prisma = ctx.prisma;
    redis = ctx.redis;
    token = await registerAndLogin(app, 'apikey');
  });

  beforeEach(async () => {
    await resetRateLimits(redis);
  });

  afterAll(async () => {
    await app.close();
  });

  const api = () => request(app.getHttpServer());

  async function createKey(scopes: string[], authToken = token) {
    const res = await api()
      .post('/api/v1/me/api-keys')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: `สคริปต์ ${scopes.join('+')}`, scopes })
      .expect(201);
    return res.body as { id: string; key: string; keyPrefix: string };
  }

  it('สร้าง key → เห็น key เต็มครั้งเดียว · รายการมีแค่ prefix · DB เก็บแค่ hash', async () => {
    const created = await createKey(['read']);
    expect(created.key).toMatch(/^nos_/);
    expect(created.key.startsWith(created.keyPrefix)).toBe(true);

    const list = await api()
      .get('/api/v1/me/api-keys')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const row = (list.body as Array<Record<string, unknown>>).find((k) => k.id === created.id);
    expect(row).toBeDefined();
    expect(row).not.toHaveProperty('key');
    expect(JSON.stringify(list.body)).not.toContain(created.key);

    const stored = await prisma.apiKey.findUniqueOrThrow({ where: { id: created.id } });
    expect(stored.keyHash).not.toContain(created.key);
  });

  it('key สิทธิ์ read: GET ได้ทั้ง Bearer และ X-API-Key · POST ได้ 403 · มี header RateLimit', async () => {
    const { key } = await createKey(['read']);

    const bearer = await api()
      .get('/api/v1/today')
      .set('Authorization', `Bearer ${key}`)
      .expect(200);
    expect(bearer.headers['ratelimit-limit']).toBe('60');
    expect(Number(bearer.headers['ratelimit-remaining'])).toBeLessThan(60);

    await api().get('/api/v1/entries').set('X-API-Key', key).expect(200);

    const write = await api()
      .post('/api/v1/entries')
      .set('Authorization', `Bearer ${key}`)
      .send({ module: 'task', title: 'จากสคริปต์' })
      .expect(403);
    expect(write.body.detail).toContain('write');
  });

  it('key สิทธิ์ write: สร้างงานได้ และงานเป็นของเจ้าของ key', async () => {
    const { key } = await createKey(['read', 'write']);
    const created = await api()
      .post('/api/v1/entries')
      .set('Authorization', `Bearer ${key}`)
      .send({ module: 'task', title: 'สร้างจาก Public API' })
      .expect(201);

    const mine = await api()
      .get(`/api/v1/entries/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(mine.body.title).toBe('สร้างจาก Public API');
  });

  it('endpoint นอก Public API (โปรไฟล์ · จัดการ key) ใช้ key ไม่ได้ — key หลุดสร้าง key ใหม่ไม่ได้', async () => {
    const { key } = await createKey(['read', 'write']);
    await api().get('/api/v1/me').set('Authorization', `Bearer ${key}`).expect(403);
    await api()
      .post('/api/v1/me/api-keys')
      .set('Authorization', `Bearer ${key}`)
      .send({ name: 'แอบสร้าง', scopes: ['write'] })
      .expect(403);
  });

  it('เพิกถอนแล้ว / หมดอายุ / key มั่ว → 401', async () => {
    const revoked = await createKey(['read']);
    await api()
      .delete(`/api/v1/me/api-keys/${revoked.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(204);
    await api().get('/api/v1/today').set('Authorization', `Bearer ${revoked.key}`).expect(401);

    const expired = await createKey(['read']);
    await prisma.apiKey.update({
      where: { id: expired.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await api().get('/api/v1/today').set('Authorization', `Bearer ${expired.key}`).expect(401);

    await api()
      .get('/api/v1/today')
      .set('Authorization', 'Bearer nos_doesNotExist0000000000000000000000000000')
      .expect(401);
  });

  it('ผู้ใช้อื่นเพิกถอน key ของเราไม่ได้ (IDOR) และไม่เห็นในรายการ', async () => {
    const mine = await createKey(['read']);
    const other = await registerAndLogin(app, 'apikey-other');
    await api()
      .delete(`/api/v1/me/api-keys/${mine.id}`)
      .set('Authorization', `Bearer ${other}`)
      .expect(404);
    const list = await api()
      .get('/api/v1/me/api-keys')
      .set('Authorization', `Bearer ${other}`)
      .expect(200);
    expect(list.body).toEqual([]);
  });

  it('เกิน 60 ครั้ง/นาที/key → 429 พร้อม Retry-After', async () => {
    const { key } = await createKey(['read']);
    let last = 0;
    for (let i = 0; i < 61; i++) {
      const res = await api().get('/api/v1/today').set('X-API-Key', key);
      last = res.status;
      if (res.status === 429) {
        expect(res.headers['retry-after']).toBeTruthy();
        break;
      }
    }
    expect(last).toBe(429);
  });
});
