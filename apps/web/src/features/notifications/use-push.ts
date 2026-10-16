'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { toast } from 'sonner';
import { useAuthStore } from '@/features/auth/auth-store';
import {
  detectPushEnvironment,
  disablePush,
  enablePush,
  pushApi,
  pushStateOf,
  registerServiceWorker,
} from './push';

const PUSH_KEY = ['push', 'status'] as const;

/** สถานะ push ของเครื่องนี้ — รวมคำตอบจากเบราว์เซอร์และเซิร์ฟเวอร์ (มี VAPID ไหม) */
export function usePushStatus() {
  return useQuery({
    queryKey: PUSH_KEY,
    queryFn: async () => {
      const config = await pushApi.config();
      const env = await detectPushEnvironment(Boolean(config.publicKey));
      return { state: pushStateOf(env), publicKey: config.publicKey };
    },
    staleTime: 60_000,
  });
}

export function useTogglePush() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { enable: true; publicKey: string } | { enable: false }) => {
      if (input.enable) await enablePush(input.publicKey);
      else await disablePush();
      return input.enable;
    },
    onSuccess: (enabled) =>
      toast.success(
        enabled ? 'เปิดการแจ้งเตือนบนเครื่องนี้แล้ว' : 'ปิดการแจ้งเตือนบนเครื่องนี้แล้ว',
      ),
    onError: (error) =>
      toast.error('เปลี่ยนการแจ้งเตือนไม่สำเร็จ', {
        description: error instanceof Error ? error.message : undefined,
      }),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: PUSH_KEY }),
  });
}

const PRECACHE_DELAY_MS = 3_000;

/**
 * ลงทะเบียน service worker ตอนเปิดแอป (Push + แคชออฟไลน์) และฟังข้อความจากมัน:
 * กด "จ่ายแล้ว" จาก notification → SW แจ้งมา → รีเฟรชทุกการ์ดที่อ่าน ['entries']
 */
export function ServiceWorkerBridge() {
  const queryClient = useQueryClient();
  // precache เฉพาะคนที่ล็อกอินแล้ว — ผู้เข้าชมหน้าแรกไม่ต้องจ่ายเน็ต ~10 หน้า + ~50 ไฟล์ของแอปที่อาจไม่ได้ใช้
  // (และไม่แย่งเน็ตตอน Lighthouse วัดหน้าแรก — Phase 8 ขั้น 2)
  const signedIn = useAuthStore((s) => s.status === 'authenticated');

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    registerServiceWorker().catch(() => undefined); // ลงทะเบียนไม่ได้ (เช่น http ที่ไม่ใช่ localhost) — แอปยังใช้ได้ปกติ
    const onMessage = (event: MessageEvent<{ type?: string }>) => {
      if (event.data?.type === 'nosion:entries-changed') {
        void queryClient.invalidateQueries({ queryKey: ['entries'] });
      }
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [queryClient]);

  useEffect(() => {
    if (!signedIn || !('serviceWorker' in navigator)) return;
    // ให้ SW เก็บหน้า/ไฟล์รุ่นล่าสุดไว้ใช้ออฟไลน์ (หลัง deploy ชื่อไฟล์เปลี่ยน) — SW เว้นช่วงเองไม่ให้ถี่
    // รอให้หน้าโหลดเสร็จก่อน: ถ้ายิงพร้อมกันหน้าแรกจะช้า
    const timer = setTimeout(() => {
      if (!navigator.onLine) return;
      void navigator.serviceWorker.ready
        .then((reg) => reg.active?.postMessage({ type: 'nosion:precache' }))
        .catch(() => undefined);
    }, PRECACHE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [signedIn]);
  return null;
}
