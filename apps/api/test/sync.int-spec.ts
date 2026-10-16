import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { RedisService } from '../src/infra/redis/redis.service';
import { createTestApp, registerAndLogin, resetRateLimits } from './helpers';

let seq = 0;
const opId = () => `op-${Date.now()}-${++seq}`;
const at = () => new Date().toISOString();

/** Phase 7 — POST /sync/push · GET /sync/pull (สเปก 7.4 นโยบาย conflict) */
describe('Offline sync (/sync)', () => {
  let app: INestApplication;
  let redis: RedisService;
  let alice = '';
  let bob = '';

  beforeAll(async () => {
    const ctx = await createTestApp();
    app = ctx.app;
    redis = ctx.redis;
    alice = await registerAndLogin(app, 'alice-sync');
    bob = await registerAndLogin(app, 'bob-sync');
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetRateLimits(redis);
  });

  const api = () => request(app.getHttpServer());
  const as = (token: string) => ({ Authorization: `Bearer ${token}` });
  const push = (token: string, operations: unknown[]) =>
    api().post('/api/v1/sync/push').set(as(token)).send({ operations }).expect(200);
  const create = async (title: string) =>
    (await api().post('/api/v1/entries').set(as(alice)).send({ module: 'task', title }).expect(201))
      .body;

  it('DoD: ออฟไลน์สร้าง 3 รายการ + แก้/ติ๊กรายการที่ยังไม่มี id → ส่งชุดเดียว · ส่งซ้ำทั้งชุดไม่ซ้ำ', async () => {
    const ops = [
      {
        opId: opId(),
        at: at(),
        op: 'create',
        data: { module: 'task', title: 'ออฟไลน์ 1', clientId: 'off-1' },
      },
      {
        opId: opId(),
        at: at(),
        op: 'create',
        data: { module: 'task', title: 'ออฟไลน์ 2', clientId: 'off-2' },
      },
      { opId: opId(), at: at(), op: 'parse', text: 'กาแฟ 65', clientId: 'off-3' },
      // อ้างรายการที่เพิ่งสร้างในชุดเดียวกันด้วย clientId
      {
        opId: opId(),
        at: at(),
        op: 'update',
        target: { clientId: 'off-1' },
        data: { title: 'ออฟไลน์ 1 (แก้)' },
        base: { title: 'ออฟไลน์ 1' },
      },
      { opId: opId(), at: at(), op: 'complete', target: { clientId: 'off-2' } },
    ];
    const first = await push(alice, ops);
    expect(first.body.results.map((r: { status: string }) => r.status)).toEqual([
      'applied',
      'applied',
      'applied',
      'applied',
      'applied',
    ]);
    expect(first.body.results[2]).toMatchObject({
      clientId: 'off-3',
      entry: { module: 'expense', title: 'กาแฟ', status: 'done' },
    });
    expect(first.body.results[3].entry.title).toBe('ออฟไลน์ 1 (แก้)');
    expect(first.body.results[4].entry.status).toBe('done');

    // เน็ตหลุดหลังส่ง → client ส่งชุดเดิมซ้ำ: ได้ผลเดิม ไม่สร้างเพิ่ม
    const again = await push(alice, ops);
    expect(again.body.results.every((r: { replayed?: boolean }) => r.replayed)).toBe(true);
    const list = await api().get('/api/v1/entries?q=ออฟไลน์').set(as(alice)).expect(200);
    expect(list.body.data).toHaveLength(2);
  });

  it('แก้ field คนละตัว → merged (อีกเครื่องแก้ priority · เครื่องนี้แก้ชื่อตอนออฟไลน์)', async () => {
    const e = await create('รายงาน');
    await api()
      .patch(`/api/v1/entries/${e.id}`)
      .set(as(alice))
      .send({ priority: 'high', version: e.version })
      .expect(200);

    const res = await push(alice, [
      {
        opId: opId(),
        at: at(),
        op: 'update',
        target: { id: e.id },
        version: e.version,
        data: { title: 'รายงานไตรมาส' },
        base: { title: 'รายงาน' },
      },
    ]);
    expect(res.body.results[0]).toMatchObject({
      status: 'merged',
      entry: { title: 'รายงานไตรมาส', priority: 'high' },
    });
  });

  it('แก้ field เดียวกันคนละค่า → server ชนะ + diff', async () => {
    const e = await create('เดิม');
    await api()
      .patch(`/api/v1/entries/${e.id}`)
      .set(as(alice))
      .send({ title: 'จากมือถือ', version: e.version })
      .expect(200);

    const res = await push(alice, [
      {
        opId: opId(),
        at: at(),
        op: 'update',
        target: { id: e.id },
        version: e.version,
        data: { title: 'จากโน้ตบุ๊ก' },
        base: { title: 'เดิม' },
      },
    ]);
    expect(res.body.results[0]).toMatchObject({
      status: 'conflict',
      entry: { title: 'จากมือถือ' },
      conflicts: [{ field: 'title', client: 'จากโน้ตบุ๊ก', server: 'จากมือถือ' }],
    });
  });

  it('ลบ vs แก้ → ลบชนะ · ลบซ้ำไม่ error · complete ซ้ำ idempotent', async () => {
    const e = await create('จะถูกลบ');
    await api().delete(`/api/v1/entries/${e.id}`).set(as(alice)).expect(204);
    const res = await push(alice, [
      {
        opId: opId(),
        at: at(),
        op: 'update',
        target: { id: e.id },
        data: { title: 'แก้ทีหลัง' },
        base: { title: 'จะถูกลบ' },
      },
      { opId: opId(), at: at(), op: 'complete', target: { id: e.id } },
      { opId: opId(), at: at(), op: 'delete', target: { id: e.id } },
    ]);
    expect(res.body.results.map((r: { status: string }) => r.status)).toEqual([
      'deleted',
      'deleted',
      'applied',
    ]);

    const done = await create('ติ๊กสองเครื่อง');
    await api().post(`/api/v1/entries/${done.id}/complete`).set(as(alice)).expect(201);
    const twice = await push(alice, [
      { opId: opId(), at: at(), op: 'complete', target: { id: done.id } },
    ]);
    expect(twice.body.results[0]).toMatchObject({ status: 'applied', entry: { status: 'done' } });
  });

  it('เลื่อนวันส่งซ้ำ (คนละคำขอ) เลื่อนครั้งเดียว · operation ที่หาเป้าไม่เจอ error แต่ตัวอื่นยังทำ', async () => {
    const e = await create('เลื่อนได้ครั้งเดียว');
    const defer = { opId: opId(), at: at(), op: 'defer', target: { id: e.id }, to: 'tomorrow' };
    const a = await push(alice, [defer]);
    const b = await push(alice, [defer]);
    expect(b.body.results[0]).toMatchObject({ replayed: true });
    expect(b.body.results[0].entry.occurredAt).toBe(a.body.results[0].entry.occurredAt);
    expect(b.body.results[0].entry.version).toBe(a.body.results[0].entry.version);

    const partial = await push(alice, [
      { opId: opId(), at: at(), op: 'complete', target: { clientId: 'ไม่มีจริง' } },
      {
        opId: opId(),
        at: at(),
        op: 'create',
        data: { module: 'task', title: 'ยังสร้างได้', clientId: 'off-ok' },
      },
    ]);
    expect(partial.body.results[0]).toMatchObject({
      status: 'error',
      error: expect.stringContaining('ไม่พบรายการ'),
    });
    expect(partial.body.results[1].status).toBe('applied');
  });

  it('pull: รายการที่เปลี่ยนตั้งแต่ since รวมที่ถูกลบ (tombstone) · ไม่เห็นของคนอื่น', async () => {
    const since = new Date().toISOString();
    const keep = await create('ดึงได้');
    const gone = await create('ลบแล้วก็ดึงได้');
    await api().delete(`/api/v1/entries/${gone.id}`).set(as(alice)).expect(204);

    const res = await api()
      .get(`/api/v1/sync/pull?since=${encodeURIComponent(since)}`)
      .set(as(alice))
      .expect(200);
    const byId = new Map(
      res.body.entries.map((e: { id: string; deletedAt: string | null }) => [e.id, e]),
    );
    expect(byId.get(keep.id)).toMatchObject({ deletedAt: null });
    expect((byId.get(gone.id) as { deletedAt: string }).deletedAt).toEqual(expect.any(String));
    expect(res.body.cursor).toEqual(expect.any(String));

    const other = await api()
      .get(`/api/v1/sync/pull?since=${encodeURIComponent(since)}`)
      .set(as(bob))
      .expect(200);
    expect(other.body.entries).toEqual([]);
  });

  it('รูปแบบผิด → 422 · ต้องล็อกอิน', async () => {
    await api()
      .post('/api/v1/sync/push')
      .set(as(alice))
      .send({ operations: [{ op: 'create' }] })
      .expect(422);
    await api().post('/api/v1/sync/push').send({ operations: [] }).expect(401);
  });
});
