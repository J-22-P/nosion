import { formatInTimeZone, zonedTimeToUtc } from './time';
import { dateTimeFormat } from './intl';

/**
 * ช่วงห้ามรบกวน (สเปก 6.2) — เวลาเป็น "HH:mm" ตามหน้าปัดในโซนของผู้ใช้
 * ช่วงข้ามเที่ยงคืนได้ เช่น 22:00–07:00
 */
export interface QuietHours {
  enabled: boolean;
  start: string;
  end: string;
  timezone: string;
}

/** "HH:mm" ของจุดเวลานั้นในโซนที่กำหนด */
function localHm(at: Date, timeZone: string): string {
  return dateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(at);
}

/** อยู่ในช่วงห้ามรบกวนไหม — ขอบเริ่มนับรวม ขอบจบไม่นับ (07:00 พอดี = ส่งได้แล้ว) · start = end = ไม่มีช่วง */
export function isInQuietHours(at: Date, quiet: QuietHours): boolean {
  if (!quiet.enabled || quiet.start === quiet.end) return false;
  const t = localHm(at, quiet.timezone);
  // สตริง HH:mm เทียบกันตามตัวอักษรได้ถูกต้องตามเวลา
  return quiet.start < quiet.end
    ? t >= quiet.start && t < quiet.end
    : t >= quiet.start || t < quiet.end;
}

/**
 * จุดเวลาถัดไปที่ช่วงห้ามรบกวนจบ (หลัง `at`) — ใช้เลื่อนการเตือนที่ตกในช่วงนั้น ไม่ทิ้ง
 * คิดเป็นวันที่ตามปฏิทินของผู้ใช้ แล้วแปลงด้วย zonedTimeToUtc → ถูกต้องข้าม DST
 */
export function quietHoursEnd(at: Date, quiet: QuietHours): Date {
  const today = formatInTimeZone(at, quiet.timezone);
  const candidate = zonedTimeToUtc(`${today}T${quiet.end}:00`, quiet.timezone);
  if (candidate.getTime() > at.getTime()) return candidate;
  const [y, m, d] = today.split('-').map(Number) as [number, number, number];
  const tomorrow = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  return zonedTimeToUtc(`${tomorrow}T${quiet.end}:00`, quiet.timezone);
}
