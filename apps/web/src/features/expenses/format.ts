import { formatMoney } from '@nosion/core';
import { DEFAULT_TIME_ZONE } from '@/lib/format';

/** KPI: ไม่มีทศนิยม · ตาราง/บิล: ทศนิยมเต็ม (สเปก 8.11.3) — กติกาเดียวกับ API */
export const baht = (minor: number, currency = 'THB') =>
  formatMoney(minor, currency, { decimals: false });
export const bahtExact = (minor: number, currency = 'THB') => formatMoney(minor, currency);

/** แกน y ของกราฟ: ฿12k แทน ฿12,000 ให้พอดีช่อง */
export function bahtCompact(minor: number): string {
  const major = minor / 100;
  if (major >= 1000)
    return `฿${(major / 1000).toLocaleString('th-TH', { maximumFractionDigits: 1 })}k`;
  return `฿${Math.round(major)}`;
}

const SHORT_DATE = new Intl.DateTimeFormat('th-TH', {
  day: 'numeric',
  month: 'short',
  timeZone: DEFAULT_TIME_ZONE,
});
const MONTH = new Intl.DateTimeFormat('th-TH', { month: 'short', timeZone: 'UTC' });
const TIME = new Intl.DateTimeFormat('th-TH', {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: DEFAULT_TIME_ZONE,
});

/** 'YYYY-MM-DD' → "5 ต.ค." (วันที่ตามปฏิทิน ไม่ใช่จุดเวลา — ตีความเป็นเที่ยงวันเวลาไทย จึงไม่ข้ามวันไม่ว่าเครื่องอยู่โซนไหน) */
export const shortDate = (ymd: string) => SHORT_DATE.format(new Date(`${ymd}T12:00:00+07:00`));

/** 'YYYY-MM' → "ก.ย." */
export const shortMonth = (period: string) => MONTH.format(new Date(`${period}-15T00:00:00Z`));

export const timeOf = (iso: string) => TIME.format(new Date(iso));
