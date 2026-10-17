import { formatMoney } from '@nosion/core/money';
import { currentIntlLocale, dateFormat } from '@/i18n/current';
import { DEFAULT_TIME_ZONE } from '@/lib/format';

/** KPI: ไม่มีทศนิยม · ตาราง/บิล: ทศนิยมเต็ม (สเปก 8.11.3) — กติกาเดียวกับ API */
export const baht = (minor: number, currency = 'THB') =>
  formatMoney(minor, currency, { decimals: false, locale: currentIntlLocale() });
export const bahtExact = (minor: number, currency = 'THB') =>
  formatMoney(minor, currency, { locale: currentIntlLocale() });

/** แกน y ของกราฟ: ฿12k แทน ฿12,000 ให้พอดีช่อง */
export function bahtCompact(minor: number): string {
  const major = minor / 100;
  if (major >= 1000)
    return `฿${(major / 1000).toLocaleString(currentIntlLocale(), { maximumFractionDigits: 1 })}k`;
  return `฿${Math.round(major)}`;
}

/** 'YYYY-MM-DD' → "5 ต.ค." (วันที่ตามปฏิทิน ไม่ใช่จุดเวลา — ตีความเป็นเที่ยงวันเวลาไทย จึงไม่ข้ามวันไม่ว่าเครื่องอยู่โซนไหน) */
export const shortDate = (ymd: string) =>
  dateFormat({ day: 'numeric', month: 'short', timeZone: DEFAULT_TIME_ZONE }).format(
    new Date(`${ymd}T12:00:00+07:00`),
  );

/** 'YYYY-MM' → "ก.ย." */
export const shortMonth = (period: string) =>
  dateFormat({ month: 'short', timeZone: 'UTC' }).format(new Date(`${period}-15T00:00:00Z`));

export const timeOf = (iso: string) =>
  dateFormat({
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: DEFAULT_TIME_ZONE,
  }).format(new Date(iso));
