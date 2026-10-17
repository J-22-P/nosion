import { numberFormat } from './intl';

/**
 * เงินเก็บเป็น "หน่วยย่อย" integer เสมอ (สตางค์) — 125.50 บาท = 12550
 * ไม่ใช้ float เพราะ 0.1 + 0.2 !== 0.3 → ยอดรวมหลายร้อยรายการจะคลาดทีละสตางค์
 */

/** ทศนิยมของสกุลเงิน — THB/USD = 2, JPY = 0 (อ่านจาก Intl ไม่ต้องดูแลตารางเอง) */
export function currencyDigits(currency: string): number {
  return (
    numberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2
  );
}

/**
 * แปลงข้อความตัวเลขที่ผู้ใช้พิมพ์เป็นหน่วยย่อย โดยไม่ผ่าน float
 * "65" → 6500 · "65.5" → 6550 · "1,250.75" → 125075 · ทศนิยมเกิน / ไม่ใช่ตัวเลข → null
 */
export function parseAmountToMinor(text: string, currency = 'THB'): number | null {
  const digits = currencyDigits(currency);
  const m = /^(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?$/.exec(text.trim());
  if (!m) return null;
  const whole = m[1]!.replace(/,/g, '');
  const fraction = m[2] ?? '';
  if (fraction.length > digits) return null;
  const minor = Number(whole + fraction.padEnd(digits, '0'));
  return Number.isSafeInteger(minor) ? minor : null;
}

/**
 * จัดรูปแบบเงินสำหรับแสดงผล (สเปก 8.9, 8.11.3)
 * KPI ไม่มีทศนิยม (`decimals: false`) · ตาราง/บิลมีทศนิยมเต็ม
 */
export function formatMoney(
  amountMinor: number,
  currency = 'THB',
  { decimals = true, locale = 'th-TH' }: { decimals?: boolean; locale?: string } = {},
): string {
  const digits = currencyDigits(currency);
  const major = amountMinor / 10 ** digits;
  return numberFormat(locale, {
    style: 'currency',
    currency,
    // ฿ ทั้งสองภาษา — en-US ค่าเริ่มต้นแสดง "THB 1,200"
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: decimals ? digits : 0,
    maximumFractionDigits: decimals ? digits : 0,
  }).format(major);
}
