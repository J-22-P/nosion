import type { Priority } from '@nosion/contracts';
import { dateFormat, tr } from '@/i18n/current';
import { dateTimeFormat } from '@nosion/core/intl';

/**
 * โซนเวลาที่ใช้ตีความ "วัน" บนหน้าจอ — ยังตายตัวเป็นเวลาไทยเหมือนเดิม
 * (ควรมาจาก settings.timezone ของผู้ใช้ — ส่งเป็นพารามิเตอร์ได้แล้ว รอผูกกับ /me)
 * ห้ามใช้ setHours/getDate ของเครื่อง: Mac เป็นเวลาไทย แต่ CI เป็น UTC → ผลไม่ตรงกัน
 */
export const DEFAULT_TIME_ZONE = 'Asia/Bangkok';

/** 'YYYY-MM-DD' ของจุดเวลานั้นตามโซนที่กำหนด */
function ymd(date: Date, timeZone: string): string {
  return dateTimeFormat('en-CA', { timeZone }).format(date);
}

/** ต่างกันกี่วันตามปฏิทิน (ไม่ขึ้นกับเวลาในวัน) */
function dayDiff(date: Date, now: Date, timeZone: string): number {
  const utc = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
  return Math.round((utc(ymd(date, timeZone)) - utc(ymd(now, timeZone))) / 86_400_000);
}

/** วันที่แบบอ่านง่าย: วันนี้ / พรุ่งนี้ / เมื่อวาน / 18 ก.ย. (ตามภาษาปัจจุบัน) */
export function formatDueDate(
  iso: string | null,
  now: Date = new Date(),
  timeZone = DEFAULT_TIME_ZONE,
): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  const days = dayDiff(date, now, timeZone);
  if (days === 0) return tr('format.today');
  if (days === 1) return tr('format.tomorrow');
  if (days === -1) return tr('format.yesterday');
  if (days < -1) return tr('format.overdueDays', { days: Math.abs(days) });
  return dateFormat({ day: 'numeric', month: 'short', timeZone }).format(date);
}

/**
 * กฎเดียวกับ isEntryOverdue() ฝั่ง API:
 * งานทั้งวัน = เลยเมื่อวันกำหนดจบแล้ว · งานมีเวลา = เลยเมื่อเลยเวลา
 */
export function isOverdueDate(
  iso: string | null,
  status: string,
  isAllDay = true,
  now: Date = new Date(),
  timeZone = DEFAULT_TIME_ZONE,
): boolean {
  if (!iso || status === 'done' || status === 'cancelled' || status === 'skipped') return false;
  const date = new Date(iso);
  return isAllDay ? dayDiff(date, now, timeZone) < 0 : date.getTime() < now.getTime();
}

/** ชื่อระดับความสำคัญตามภาษา */
export function priorityLabel(priority: Priority): string {
  return tr(`priority.${priority}`);
}

/**
 * v1.1 monochrome: สีใช้เฉพาะเมื่อมีความหมาย (8.7.1) — urgent เท่านั้นที่เป็นสีแดง
 * ที่เหลือแยกด้วยรูปทรงของ badge (ทึบ / outline) ไม่ใช่สีรุ้ง
 */
export const PRIORITY_TONE: Record<Priority, 'danger' | 'neutral' | 'outline' | null> = {
  none: null,
  low: 'outline',
  medium: 'outline',
  high: 'neutral',
  urgent: 'danger',
};

/** ระยะเวลาแบบสั้นสำหรับการ์ด Focus: 9900 → "2h 45m" · 2700 → "45m" · 0 → "0m" */
export function formatDuration(totalSeconds: number): string {
  const minutes = Math.max(0, Math.floor(totalSeconds / 60));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** นาฬิกาจับเวลา: 754 → "12:34" · 3723 → "1:02:03" */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}
