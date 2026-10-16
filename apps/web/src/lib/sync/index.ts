import type { EntryDto, SyncOperationInput, SyncPushDto } from '@nosion/contracts';
import type { QueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import { findCachedEntry } from './entry-cache';
import { runOrQueue, type RunOrQueue } from './offline';
import { indexedDbOutbox, memoryOutbox, type OutboxStorage } from './outbox-storage';
import { SyncEngine } from './sync-engine';

export { isLocalId, isQueued, localId, targetOf } from './offline';
export { isNetworkError } from './sync-engine';
export { persistQueryClient, whenRestored, wipePersistedQueries } from './query-persist';
export type { SyncState } from './sync-engine';

const isOnline = () => typeof navigator === 'undefined' || navigator.onLine;

function pickStorage(): OutboxStorage {
  if (typeof indexedDB === 'undefined') return memoryOutbox();
  const idb = indexedDbOutbox();
  const memory = memoryOutbox();
  // เปิด IndexedDB ไม่ได้ (Firefox private mode รุ่นเก่า ฯลฯ) → ใช้หน่วยความจำ: ยังใช้ออฟไลน์ได้จนปิดแท็บ
  let broken = false;
  const guard =
    <A extends unknown[], R>(fn: (s: OutboxStorage) => (...args: A) => Promise<R>) =>
    async (...args: A): Promise<R> => {
      if (!broken) {
        try {
          return await fn(idb)(...args);
        } catch {
          broken = true;
        }
      }
      return fn(memory)(...args);
    };
  return {
    add: guard((s) => s.add),
    list: guard((s) => s.list),
    count: guard((s) => s.count),
    remove: guard((s) => s.remove),
  };
}

/** ตัวซิงก์ตัวเดียวของแท็บ — SyncBridge (providers) ผูกผู้ใช้ + ตัวกระตุ้น (online/โฟกัส/รอบเวลา) */
export const syncEngine = new SyncEngine({
  storage: pickStorage(),
  push: (operations: SyncOperationInput[]) =>
    apiFetch<SyncPushDto>('/sync/push', { method: 'POST', body: { operations } }),
  isOnline,
});

let queryClient: QueryClient | null = null;
/** providers ผูกไว้ — ชั้น api ใช้หาภาพรายการล่าสุดจากแคชตอนเข้าคิว โดยไม่ต้อง import React */
export function bindSyncQueryClient(client: QueryClient): void {
  queryClient = client;
}

export const cachedEntry = (id: string): EntryDto | null =>
  queryClient ? findCachedEntry(queryClient, id) : null;

export const offlineCapable = <T>(args: RunOrQueue<T>): Promise<T> =>
  runOrQueue(syncEngine, isOnline, args);
