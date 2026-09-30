import type { Priority } from '@nosion/contracts';

const TH_DATE = new Intl.DateTimeFormat('th-TH', {
  day: 'numeric',
  month: 'short',
  timeZone: 'Asia/Bangkok',
});

/** วันที่แบบอ่านง่าย: วันนี้ / พรุ่งนี้ / เมื่อวาน / 18 ก.ย. */
export function formatDueDate(iso: string | null, now: Date = new Date()): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  const diff = startOfDay(date).getTime() - startOfDay(now).getTime();
  const days = Math.round(diff / 86_400_000);
  if (days === 0) return 'วันนี้';
  if (days === 1) return 'พรุ่งนี้';
  if (days === -1) return 'เมื่อวาน';
  if (days < -1) return `เลยมา ${Math.abs(days)} วัน`;
  return TH_DATE.format(date);
}

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function isOverdueDate(iso: string | null, status: string, now: Date = new Date()): boolean {
  if (!iso || status === 'done' || status === 'cancelled') return false;
  return new Date(iso).getTime() < now.getTime();
}

export const PRIORITY_LABEL: Record<Priority, string> = {
  none: 'ไม่ระบุ',
  low: 'ต่ำ',
  medium: 'ปานกลาง',
  high: 'สูง',
  urgent: 'ด่วน',
};

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
