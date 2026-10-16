'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { toast } from 'sonner';
import { useAuthStore } from '@/features/auth/auth-store';
import { bindSyncQueryClient, syncEngine, wipePersistedQueries } from '@/lib/sync';
import { ConflictDialog, useConflictStore } from './conflict-dialog';
import { summarizeResults } from './summarize';
import { useSyncState } from './use-sync';

/** ระหว่างยังมีของค้างและออนไลน์ ลองส่งใหม่ทุกเท่านี้ (เผื่อ server ล่ม/429 ไปชั่วคราว) */
const RETRY_MS = 30_000;

/** tag ของ Background Sync — service worker ปลุกแท็บที่เปิดอยู่ให้ flush เมื่อเครื่องกลับมาออนไลน์ */
const SYNC_TAG = 'nosion-outbox';

/**
 * ผูกตัวซิงก์เข้ากับแอป (วางครั้งเดียวใน providers)
 *  - ผู้ใช้ที่ล็อกอิน → นับคิวของคนนั้นแล้วส่งทันที
 *  - ตัวกระตุ้น: เน็ตกลับมา (online) · กลับมาที่แท็บ · ทุก 30 วิ ถ้ายังค้าง · service worker ปลุก (Background Sync — ขั้น 3)
 *  - ผลกลับมา → รีเฟรชแคช + บอกผู้ใช้เฉพาะสิ่งที่ต้องรู้ (ชนกัน · ถูกลบไปก่อน · ล้ม)
 */
export function SyncBridge() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const { pending, status } = useSyncState();

  useEffect(() => bindSyncQueryClient(queryClient), [queryClient]);

  // ไม่ได้ล็อกอิน (ออกจากระบบ / refresh ถูกปฏิเสธ) → ล้างข้อมูลของคนก่อนทั้งในหน่วยความจำและบนดิสก์
  // (คงไว้แค่ session ซึ่งหน้า login ยังสังเกตอยู่) · คิว outbox ไม่ลบ: แยกตามผู้ใช้ รอเจ้าของกลับมาส่ง
  useEffect(
    () =>
      useAuthStore.subscribe((state, prev) => {
        if (state.status !== 'anonymous' || prev.status === 'anonymous') return;
        queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== 'session' });
        void wipePersistedQueries();
      }),
    [queryClient],
  );

  // มีของค้างตอนออฟไลน์ → ขอ Background Sync (Chromium) ให้ปลุกเราทันทีที่เน็ตกลับ แม้แท็บอยู่เบื้องหลัง
  useEffect(() => {
    if (status !== 'offline' || !pending || !('serviceWorker' in navigator)) return;
    void navigator.serviceWorker.ready
      .then((reg) =>
        (
          reg as ServiceWorkerRegistration & { sync?: { register(tag: string): Promise<void> } }
        ).sync?.register(SYNC_TAG),
      )
      .catch(() => undefined);
  }, [status, pending]);

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
        if (conflicts.length) {
          useConflictStore.getState().add(results.filter((r) => r.status === 'conflict'));
          toast.warning(
            conflicts.length === 1
              ? 'แก้ชนกับอุปกรณ์อื่น — ใช้ค่าบนเซิร์ฟเวอร์'
              : `แก้ชนกับอุปกรณ์อื่น ${conflicts.length} รายการ — ใช้ค่าบนเซิร์ฟเวอร์`,
            {
              description: conflicts
                .map((c) => `${c.title}${c.fields.length ? ` · ${c.fields.join(', ')}` : ''}`)
                .join('\n'),
              action: { label: 'ดูรายละเอียด', onClick: () => useConflictStore.getState().show() },
            },
          );
        }
        if (deleted) toast.info(`${deleted} รายการถูกลบจากอุปกรณ์อื่นไปก่อนแล้ว`);
        if (errors.length) {
          toast.error(`ซิงก์ไม่สำเร็จ ${errors.length} รายการ`, { description: errors[0] });
        }
      }),
    [queryClient],
  );

  return <ConflictDialog />;
}
