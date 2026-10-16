'use client';

import { useMemo, useSyncExternalStore } from 'react';
import { pendingView, syncEngine, type PendingView, type SyncState } from '@/lib/sync';
import { useOnlineStatus } from '@/lib/use-online-status';
import { connectionView, type ConnectionView } from './connection';

const SERVER_STATE: SyncState = {
  pending: 0,
  queue: [],
  status: 'idle',
  lastSyncedAt: null,
  lastError: null,
};

/** สถานะของ outbox (คิว · กำลังส่ง · ซิงก์ล่าสุด) — ฝั่ง server ถือว่าว่าง */
export function useSyncState(): SyncState {
  return useSyncExternalStore(syncEngine.subscribe, syncEngine.getState, () => SERVER_STATE);
}

/** เน็ต + คิว รวมเป็นสถานะเดียวของ pill / sidebar / Today */
export function useConnection(): ConnectionView &
  Pick<SyncState, 'pending' | 'lastSyncedAt' | 'lastError'> & { online: boolean } {
  const online = useOnlineStatus();
  const sync = useSyncState();
  const { pending, lastSyncedAt, lastError } = sync;
  return { ...connectionView(online, sync), pending, lastSyncedAt, lastError, online };
}

/** รายการที่สร้างตอนออฟไลน์ + id ที่รอซิงก์ */
export function usePendingView(): PendingView {
  const { queue } = useSyncState();
  return useMemo(() => pendingView(queue), [queue]);
}

export const syncNow = (): Promise<void> => syncEngine.flush();
