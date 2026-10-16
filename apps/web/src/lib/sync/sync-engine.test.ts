import type { SyncOperationInput, SyncPushDto, SyncResult } from '@nosion/contracts';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api-client';
import { runOrQueue } from './offline';
import { memoryOutbox } from './outbox-storage';
import { SyncEngine } from './sync-engine';

const applied = (ops: SyncOperationInput[]): SyncPushDto => ({
  results: ops.map((o): SyncResult => ({ opId: o.opId, status: 'applied' })),
  serverTime: '2026-10-16T00:00:00Z',
});

function setup(opts: { online?: boolean } = {}) {
  let online = opts.online ?? true;
  let n = 0;
  const storage = memoryOutbox();
  const push = vi.fn(async (ops: SyncOperationInput[]) => applied(ops));
  const engine = new SyncEngine({
    storage,
    push,
    isOnline: () => online,
    newId: () => `op-${++n}`,
  });
  return { engine, storage, push, setOnline: (v: boolean) => (online = v) };
}

const create = (clientId: string) =>
  ({ op: 'create', data: { module: 'task', title: clientId, clientId } }) as const;

const apiError = (status: number) =>
  new ApiError({ type: 'about:blank', title: 'x', status, detail: `HTTP ${status}` });

describe('SyncEngine', () => {
  it('ออฟไลน์: เข้าคิว (นับ pending) · เน็ตกลับมาส่งตามลำดับในชุดเดียวแล้วคิวว่าง', async () => {
    const { engine, push, setOnline } = setup({ online: false });
    await engine.setUser('u1');
    await engine.enqueue(create('a'));
    await engine.enqueue(create('b'));
    await engine.enqueue({ op: 'complete', target: { clientId: 'a' } });
    expect(engine.getState()).toMatchObject({ pending: 3, status: 'offline' });

    await engine.flush();
    expect(push).not.toHaveBeenCalled();

    setOnline(true);
    const seen: SyncResult[][] = [];
    engine.onResults((r) => seen.push(r));
    await engine.flush();
    expect(push).toHaveBeenCalledTimes(1);
    expect(push.mock.calls[0]![0].map((o) => o.opId)).toEqual(['op-1', 'op-2', 'op-3']);
    expect(engine.getState()).toMatchObject({ pending: 0, status: 'idle' });
    expect(seen[0]).toHaveLength(3);
  });

  it('เน็ตหลุดระหว่างส่ง → คิวอยู่ครบ (ส่งชุดเดิมซ้ำรอบหน้าด้วย opId เดิม)', async () => {
    const { engine, push } = setup();
    await engine.setUser('u1');
    await engine.enqueue(create('a'));
    push.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await engine.flush();
    expect(engine.getState()).toMatchObject({ pending: 1, status: 'error' });

    await engine.flush();
    expect(push.mock.calls.map((c) => c[0][0]!.opId)).toEqual(['op-1', 'op-1']);
    expect(engine.getState()).toMatchObject({ pending: 0, status: 'idle', lastError: null });
  });

  it('5xx / 401 / 429 = ลองใหม่ · 422 = ทิ้งแล้วรายงาน error (ไม่ค้างคิวตลอดไป)', async () => {
    const { engine, push } = setup();
    await engine.setUser('u1');
    await engine.enqueue(create('a'));
    for (const status of [503, 401, 429]) {
      push.mockRejectedValueOnce(apiError(status));
      await engine.flush();
      expect(engine.getState().pending).toBe(1);
    }
    const seen: SyncResult[] = [];
    engine.onResults((r) => seen.push(...r));
    push.mockRejectedValueOnce(apiError(422));
    await engine.flush();
    expect(engine.getState().pending).toBe(0);
    expect(seen).toEqual([{ opId: 'op-1', status: 'error', error: 'HTTP 422' }]);
  });

  it('เกิน 100 → แบ่งหลายชุด · flush ซ้อนกันได้รอบเดียว', async () => {
    const { engine, push, setOnline } = setup({ online: false });
    await engine.setUser('u1');
    for (let i = 0; i < 150; i++) await engine.enqueue(create(`c${i}`));
    setOnline(true);
    await Promise.all([engine.flush(), engine.flush()]);
    expect(push.mock.calls.map((c) => c[0].length)).toEqual([100, 50]);
  });

  it('คิวแยกตามผู้ใช้ — คนถัดไปที่ล็อกอินไม่ส่งของคนก่อน', async () => {
    const { engine, push, setOnline } = setup({ online: false });
    await engine.setUser('u1');
    await engine.enqueue(create('ของ u1'));
    await engine.setUser('u2');
    expect(engine.getState().pending).toBe(0);
    setOnline(true);
    await engine.flush();
    expect(push).not.toHaveBeenCalled();
    await engine.setUser('u1');
    expect(engine.getState().pending).toBe(1);
  });
});

describe('runOrQueue', () => {
  const local = () => ({ id: 'local' });

  it('ออนไลน์และคิวว่าง → เรียก API ตรง', async () => {
    const { engine } = setup();
    await engine.setUser('u1');
    const online = vi.fn(async () => ({ id: 'server' }));
    await expect(
      runOrQueue(engine, () => true, { online, op: () => create('a'), local }),
    ).resolves.toEqual({ id: 'server' });
    expect(engine.getState().pending).toBe(0);
  });

  it('ออฟไลน์ → เข้าคิว ไม่เรียก API · คืนภาพที่คาดไว้', async () => {
    const { engine } = setup({ online: false });
    await engine.setUser('u1');
    const online = vi.fn();
    await expect(
      runOrQueue(engine, () => false, { online, op: () => create('a'), local }),
    ).resolves.toEqual({ id: 'local' });
    expect(online).not.toHaveBeenCalled();
    expect(engine.getState().pending).toBe(1);
  });

  it('เน็ตหลุดระหว่างเรียก → เข้าคิว · server ตอบ error → โยนต่อ (ไม่เข้าคิว)', async () => {
    const { engine, setOnline } = setup({ online: false });
    await engine.setUser('u1');
    await runOrQueue(engine, () => true, {
      online: () => Promise.reject(new TypeError('Failed to fetch')),
      op: () => create('a'),
      local,
    });
    expect(engine.getState().pending).toBe(1);

    setOnline(true);
    await engine.flush();
    await expect(
      runOrQueue(engine, () => true, {
        online: () => Promise.reject(apiError(409)),
        op: () => create('b'),
        local,
      }),
    ).rejects.toBeInstanceOf(ApiError);
    expect(engine.getState().pending).toBe(0);
  });

  it('คิวยังมีของค้าง → เข้าคิวต่อท้าย (ห้ามแซงลำดับ) แม้ออนไลน์', async () => {
    const { engine, push } = setup({ online: false });
    await engine.setUser('u1');
    await engine.enqueue(create('a'));
    push.mockImplementation(async () => new Promise<SyncPushDto>(() => undefined)); // ค้างไว้
    const online = vi.fn();
    await runOrQueue(engine, () => true, {
      online,
      op: () => ({ op: 'complete', target: { clientId: 'a' } }),
      local,
    });
    expect(online).not.toHaveBeenCalled();
    expect(engine.getState().pending).toBe(2);
  });
});
