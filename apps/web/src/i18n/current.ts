import { createTranslator } from 'next-intl';
import type { ReactNode } from 'react';
import { DEFAULT_LOCALE, intlLocale, type Locale } from './config';

/**
 * ภาษาปัจจุบันสำหรับโค้ดที่ไม่ใช่ component (ตัวจัดรูปแบบวันที่/เงิน · สรุปกฎการเกิดซ้ำ · โมเดลของ ⌘K · toast ใน sync engine)
 * component ใช้ `useTranslations` ตามปกติ — ที่นี่สำหรับฟังก์ชันบริสุทธิ์ที่ถูกเรียกจากหลายที่ ไม่ต้องลาก `t` ผ่านทุกชั้น
 *
 * ตั้งค่าโดย <LocaleBridge> (ใน layout) ทุกครั้งที่ render — หน้าโหลดใหม่เมื่อสลับภาษา จึงไม่มีช่วงที่ค่าไม่ตรงกัน
 * เทสต์ตั้งเป็นภาษาไทยใน src/test-setup.ts
 */
type Values = Record<string, string | number | Date>;
type Translate = (key: string, values?: Values) => string;
type RichValues = Record<string, string | number | Date | ((chunks: ReactNode) => ReactNode)>;
type TranslateRich = (key: string, values?: RichValues) => ReactNode;

let locale: Locale = DEFAULT_LOCALE;
/** ค่าเริ่มต้นเดียวกับ settings.buddhistEra ของบัญชีใหม่ (พ.ศ.) */
let buddhistEra = true;
let translate: Translate | null = null;
let translateRich: TranslateRich | null = null;

export function configureI18n(next: {
  locale: Locale;
  messages: Record<string, unknown>;
  buddhistEra?: boolean;
}): void {
  if (translate && next.locale === locale && (next.buddhistEra ?? buddhistEra) === buddhistEra) {
    return;
  }
  locale = next.locale;
  buddhistEra = next.buddhistEra ?? buddhistEra;
  const t = createTranslator({ locale: next.locale, messages: next.messages });
  translate = (key, values) => t(key as never, values as never);
  translateRich = (key, values) => t.rich(key as never, values as never);
}

/** ตั้งเฉพาะการแสดงปีพุทธศักราช (มาจาก settings ของผู้ใช้หลังโหลด /me) */
export function setBuddhistEra(value: boolean): void {
  buddhistEra = value;
}

/** แปลข้อความด้วย key เต็ม เช่น `tr('format.today')` */
export function tr(key: string, values?: Values): string {
  return translate ? translate(key, values) : key;
}

/** ข้อความที่มีแท็ก เช่น `ครบกำหนด <b>{count}</b> รายการ` → แทนแท็กด้วย element */
tr.rich = (key: string, values?: RichValues): ReactNode =>
  translateRich ? translateRich(key, values) : key;

export function currentLocale(): Locale {
  return locale;
}

/** locale ของ Intl (`th-TH` · `th-TH-u-ca-buddhist` · `en-US`) */
export function currentIntlLocale(): string {
  return intlLocale(locale, buddhistEra);
}

const cache = new Map<string, Intl.DateTimeFormat>();

/** Intl.DateTimeFormat ตามภาษาปัจจุบัน — แคชต่อ (locale + options) */
export function dateFormat(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${currentIntlLocale()}|${JSON.stringify(options)}`;
  let f = cache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(currentIntlLocale(), options);
    cache.set(key, f);
  }
  return f;
}

/** ชื่อโมดูลตามภาษา (MODULE_THEME ใน @nosion/ui มีแค่ชื่อไทย) */
export function moduleLabel(module: 'task' | 'expense' | 'workout' | 'habit'): string {
  return tr(`modules.${module}`);
}
