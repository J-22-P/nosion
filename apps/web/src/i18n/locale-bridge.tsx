'use client';

import { useLocale, useMessages } from 'next-intl';
import type { Locale } from './config';
import { configureI18n } from './current';

/** ส่งภาษา + ข้อความให้โค้ดที่ไม่ใช่ component (i18n/current.ts) — ทำระหว่าง render ให้พร้อมก่อนลูกทุกตัว */
export function LocaleBridge() {
  const locale = useLocale() as Locale;
  const messages = useMessages();
  configureI18n({ locale, messages: messages as Record<string, unknown> });
  return null;
}
