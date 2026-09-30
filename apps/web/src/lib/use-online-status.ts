'use client';

import { useSyncExternalStore } from 'react';

function subscribe(callback: () => void) {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
}

/**
 * สถานะเครือข่ายของเบราว์เซอร์ — ตัวตั้งต้นของ Connection pill (8.2)
 * Phase 7 จะผูกเพิ่มกับ outbox (จำนวนที่รอซิงก์ / กำลังซิงก์)
 * ฝั่ง server ถือว่า online เพื่อไม่ให้ HTML แรกแสดงออฟไลน์ผิด ๆ
 */
export function useOnlineStatus(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
}
