/**
 * ภาษาที่รองรับ (สเปก 8.9: ไทยเป็นค่าเริ่มต้น + อังกฤษ)
 *
 * URL ไม่มี /en นำหน้า — ภาษาเก็บในคุกกี้ `NOSION_LOCALE` แล้ว middleware rewrite ไปหน้า `/[locale]/…` ภายใน
 * ทุกหน้าจึงยังถูกสร้างล่วงหน้าแบบ static ครบทั้งสองภาษา (ไม่ต้อง render ใหม่ทุกคำขอ) · ลิงก์ในแอปไม่ต้องรู้เรื่องภาษา
 * ไม่เดาจาก Accept-Language โดยตั้งใจ — ผลแน่นอน (เทสต์/Lighthouse) · ผู้ใช้เลือกเองได้ที่หน้าแรก/login/ตั้งค่า และบัญชีจำไว้
 */
export const LOCALES = ['th', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'th';
export const LOCALE_COOKIE = 'NOSION_LOCALE';

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/** locale ของ Intl สำหรับวันที่/ตัวเลข — ไทยเลือกปีพุทธศักราช/คริสต์ศักราชได้ (สเปก 8.9 `th-u-ca-buddhist`) · ค่าเริ่มต้น พ.ศ. */
export function intlLocale(locale: Locale, buddhistEra = true): string {
  if (locale === 'en') return 'en-US';
  // ระบุปฏิทินเสมอ — `th-TH` เฉย ๆ ของ Intl คือพุทธศักราช
  return buddhistEra ? 'th-TH-u-ca-buddhist' : 'th-TH-u-ca-gregory';
}

/** ตั้งคุกกี้ภาษา (1 ปี) — ฝั่ง client */
export function writeLocaleCookie(locale: Locale): void {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`;
}

/** คุกกี้ภาษา (ฝั่ง client) — มีเฉพาะเมื่อผู้ใช้เคยเลือกเองบนเครื่องนี้ · ไม่มี = null */
export function readLocaleCookie(): Locale | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${LOCALE_COOKIE}=([^;]+)`));
  return isLocale(match?.[1]) ? match[1] : null;
}
