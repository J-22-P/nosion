import { QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  persistQueryClient,
  whenRestored,
  wipePersistedQueries,
  type KvStorage,
} from './query-persist';

function memoryKv(): KvStorage & { data: Map<string, unknown> } {
  const data = new Map<string, unknown>();
  return {
    data,
    get: async (k) => structuredClone(data.get(k)),
    set: async (k, v) => void data.set(k, structuredClone(v)),
    remove: async (k) => void data.delete(k),
  };
}

describe('persistQueryClient', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('เก็บ query ที่สำเร็จลงที่เก็บ (หน่วง 1 วิ) → เปิดใหม่ได้ข้อมูลกลับมา · ตัด preview/ค้นหา', async () => {
    const kv = memoryKv();
    const first = new QueryClient();
    const stop = persistQueryClient(first, kv);
    await whenRestored();
    first.setQueryData(['entries', { module: 'task' }], { data: [{ id: 'a' }] });
    first.setQueryData(['session'], { user: { id: 'u1' } });
    first.setQueryData(['parse', 'กาแฟ'], { best: null });
    first.setQueryData(['entries', 'search', 'กา'], { data: [] });
    expect(kv.data.size).toBe(0);
    await vi.advanceTimersByTimeAsync(1_000);
    stop();

    const second = new QueryClient();
    persistQueryClient(second, kv);
    await whenRestored();
    expect(second.getQueryData(['entries', { module: 'task' }])).toEqual({ data: [{ id: 'a' }] });
    expect(second.getQueryData(['session'])).toEqual({ user: { id: 'u1' } });
    expect(second.getQueryData(['parse', 'กาแฟ'])).toBeUndefined();
    expect(second.getQueryData(['entries', 'search', 'กา'])).toBeUndefined();
  });

  it('ของเก่าเกิน 7 วันไม่ใช้ · ออกจากระบบแล้วลบทิ้ง', async () => {
    const kv = memoryKv();
    let now = Date.parse('2026-10-01T00:00:00Z');
    const first = new QueryClient();
    persistQueryClient(first, kv, () => now);
    await whenRestored();
    first.setQueryData(['entries', 'today'], { ok: true });
    await vi.advanceTimersByTimeAsync(1_000);

    now += 8 * 86_400_000;
    const stale = new QueryClient();
    persistQueryClient(stale, kv, () => now);
    await whenRestored();
    expect(stale.getQueryData(['entries', 'today'])).toBeUndefined();

    await wipePersistedQueries();
    expect(kv.data.size).toBe(0);
  });

  it('ข้อมูลในแคชใหม่กว่าของที่เก็บ → ไม่ทับ (ออนไลน์โหลดเสร็จก่อนอ่านดิสก์)', async () => {
    const kv = memoryKv();
    await kv.set('query-cache', {
      buster: 'v1',
      savedAt: Date.now(),
      state: {
        mutations: [],
        queries: [
          {
            queryKey: ['entries', 'today'],
            queryHash: '["entries","today"]',
            state: { data: 'เก่า', dataUpdatedAt: 1, status: 'success' },
          },
        ],
      },
    });
    const client = new QueryClient();
    client.setQueryData(['entries', 'today'], 'สด');
    persistQueryClient(client, kv);
    await whenRestored();
    expect(client.getQueryData(['entries', 'today'])).toBe('สด');
  });
});
