'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useSyncExternalStore } from 'react';
import { toast } from 'sonner';
import { useAuthStore } from '@/features/auth/auth-store';
import { bindSyncQueryClient, syncEngine, type SyncState } from '@/lib/sync';
import { summarizeResults } from './summarize';

/** ระหว่างยังมีของค้างและออนไลน์ ลองส่งใหม่ทุกเท่านี้ (เผื่อ server ล่ม/429 ไปชั่วคราว) */
const RETRY_MS = 30_000;

const SERVER_STATE: SyncState = { pending: 0, status: 'idle', lastSyncedAt: null, lastError: null };

/** สถานะของ outbox สำหรับ UI (pill · sidebar · การ์ด — ขั้น 4) */
export function useSyncState(): SyncState {
  return useSyncExternalStore(syncEngine.subscribe, syncEngine.getState, () => SERVER_STATE);
}

/**
 * ผูกตัวซิงก์เข้ากับแอป (วางครั้งเดียวใน providers)
 *  - ผู้ใช้ที่ล็อกอิน → นับคิวของคนนั้นแล้วส่งทันที
 *  - ตัวกระตุ้น: เน็ตกลับมา (online) · กลับมาที่แท็บ · ทุก 30 วิ ถ้ายังค้าง · service worker ปลุก (Background Sync — ขั้น 3)
 *  - ผลกลับมา → รีเฟรชแคช + บอกผู้ใช้เฉพาะสิ่งที่ต้องรู้ (ชนกัน · ถูกลบไปก่อน · ล้ม)
 */
export function SyncBridge() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const { pending } = useSyncState();

  useEffect(() => bindSyncQueryClient(queryClient), [queryClient]);

  useEffect(() => {
    void syncEngine.setUser(userId).then(() => syncEngine.flush());
  }, [userId]);

  useEffect(() => {
    const flush = () => void syncEngine.flush();
    const onVisible = () => {
      if (document.visibilityState === 'visible') flush();
    };
    const onMessage = (event: MessageEvent) => {
      if ((event.data as { type?: string } | null)?.type === 'nosion:sync') flush();
    };
    window.addEventListener('online', flush);
    document.addEventListener('visibilitychange', onVisible);
    navigator.serviceWorker?.addEventListener('message', onMessage);
    return () => {
      window.removeEventListener('online', flush);
      document.removeEventListener('visibilitychange', onVisible);
      navigator.serviceWorker?.removeEventListener('message', onMessage);
    };
  }, []);

  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(() => void syncEngine.flush(), RETRY_MS);
    return () => clearInterval(timer);
  }, [pending]);

  useEffect(
    () =>
      syncEngine.onResults((results) => {
        void queryClient.invalidateQueries({ queryKey: ['entries'] });
        // operation parse อาจสร้างแท็ก/โปรเจกต์/กฎใหม่ที่ server
        void queryClient.invalidateQueries({ queryKey: ['tags'] });
        void queryClient.invalidateQueries({ queryKey: ['projects'] });

        const { saved, conflicts, deleted, errors } = summarizeResults(results);
        if (saved && !conflicts.length && !errors.length) {
          toast.success(`ซิงก์แล้ว ${saved} รายการ`);
        }
        for (const c of conflicts) {
          toast.warning('แก้ชนกับอุปกรณ์อื่น — ใช้ค่าบนเซิร์ฟเวอร์', {
            description: `${c.title}${c.fields.length ? ` · ${c.fields.join(', ')}` : ''}`,
          });
        }
        if (deleted) toast.info(`${deleted} รายการถูกลบจากอุปกรณ์อื่นไปก่อนแล้ว`);
        if (errors.length) {
          toast.error(`ซิงก์ไม่สำเร็จ ${errors.length} รายการ`, { description: errors[0] });
        }
      }),
    [queryClient],
  );

  return null;
}
