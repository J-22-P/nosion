'use client';

import { useLocale } from 'next-intl';
import { useEffect } from 'react';
import { authApi, type MeResponse } from '@/features/auth/api';
import { isLocale, readLocaleCookie, writeLocaleCookie } from './config';
import { setBuddhistEra } from './current';

/**
 * ภาษาของบัญชี ↔ ภาษาของเครื่อง (เรียกใน AppShell หลังได้ settings)
 *  • เครื่องนี้เคยเลือกภาษาเอง (มีคุกกี้) → นั่นคือการเลือกล่าสุด → บันทึกลงบัญชีถ้ายังไม่ตรง
 *    (เช่น เลือก English ที่หน้า login แล้วสมัคร — บัญชีใหม่เริ่มที่ไทย)
 *  • ไม่เคยเลือก → ใช้ภาษาของบัญชี (เปิดเครื่องใหม่แล้วได้ภาษาที่ตั้งไว้) → ตั้งคุกกี้แล้วโหลดใหม่ถ้าไม่ตรง
 */
export function useLocaleSync(settings: MeResponse['settings'] | undefined): void {
  const locale = useLocale();
  // ปีพุทธศักราชมีผลกับตัวจัดรูปแบบทันทีใน render นี้ (ไม่ต้องรอ effect)
  if (settings) setBuddhistEra(settings.buddhistEra);

  useEffect(() => {
    if (!settings) return;
    const chosen = readLocaleCookie();
    if (chosen) {
      if (chosen !== settings.locale)
        void authApi.updateSettings({ locale: chosen }).catch(() => undefined);
      return;
    }
    if (isLocale(settings.locale) && settings.locale !== locale) {
      writeLocaleCookie(settings.locale);
      window.location.reload();
    }
  }, [settings, locale]);
}
