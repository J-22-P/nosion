'use client';

import { ProblemType } from '@nosion/contracts';
import { useTranslations } from 'next-intl';
import { currentLocale, tr } from './current';
import { ApiError } from '@/lib/api-client';

const THAI = /[฀-๿]/;

/** ข้อความ validation ที่กำหนดไว้ใน packages/contracts (ใช้ร่วมกับ API) → key ของข้อความแปล */
const CONTRACT_MESSAGES: Record<string, string> = {
  'รหัสผ่านต้องยาวอย่างน้อย 12 ตัวอักษร': 'passwordMin',
  ตั้งชื่อให้จำได้ว่าใช้ที่ไหน: 'apiKeyName',
  'เลือกอย่างน้อย 1 สิทธิ์': 'apiKeyScope',
  'ต้องเป็นสี hex เช่น #6366f1': 'hexColor',
  'เวลาต้องเป็น HH:mm (00:00–23:59)': 'clockTime',
};

/**
 * ข้อความ error ของช่องในฟอร์ม — schema ใน contracts ใช้ร่วมกับ API จึงเขียนข้อความไว้ภาษาเดียว (ไทย)
 * ที่นี่แปลข้อความที่รู้จัก + ข้อความมาตรฐานของ Zod (อังกฤษ) ตาม code
 */
export function useFieldErrorText() {
  const t = useTranslations('validation');
  return (error: { type?: unknown; message?: string } | undefined): string | undefined => {
    if (!error?.message) return undefined;
    const key = CONTRACT_MESSAGES[error.message];
    if (key) return t(key);
    if (error.type === 'invalid_string' && /email/i.test(error.message)) return t('email');
    if (error.type === 'too_small') return t('required');
    if (error.type === 'too_big') return t('tooLong');
    return error.message;
  };
}

/**
 * ข้อความ error จาก API — ข้อความของเซิร์ฟเวอร์เป็นภาษาไทย (Problem Details `detail`)
 * ภาษาไทย: แสดงตามที่เซิร์ฟเวอร์บอก (เจาะจงที่สุด) · ภาษาอังกฤษ: ใช้ข้อความกลางตามชนิดปัญหาแทน (ไม่ให้เห็นภาษาไทยปน)
 * ไม่ใช่ ApiError (เน็ตหลุด ฯลฯ) → undefined ให้ผู้เรียกใช้ข้อความของตัวเอง
 */
export function errorText(error: unknown): string | undefined {
  if (!(error instanceof ApiError)) return undefined;
  if (currentLocale() === 'th' || !THAI.test(error.message)) return error.message;
  return tr(`errors.problem.${problemKey(error)}`);
}

/** ชื่อเดิมสำหรับ component — ทำงานเหมือน errorText */
export function useApiErrorText() {
  return errorText;
}

function problemKey(error: ApiError): string {
  const { type, status } = error.problem;
  if (type === ProblemType.validationFailed || status === 422) return 'validation';
  if (type === ProblemType.rateLimited || status === 429) return 'rateLimited';
  if (status === 401) return 'unauthorized';
  if (/demo/i.test(error.problem.title)) return 'demo';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'notFound';
  if (status === 409) return 'conflict';
  return 'server';
}
