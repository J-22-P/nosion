import { text, type Lang } from './text';
/**
 * ฟังก์ชันเวลาแบบบริสุทธิ์ — ไม่มี side effect, ไม่อ่านนาฬิกาเอง
 * ทุกที่ที่ต้องรู้ "ตอนนี้" ให้รับ Date เข้ามาเป็นพารามิเตอร์ เพื่อให้ test ควบคุมเวลาได้
 */

/** ขอบวันตามโซนเวลาของผู้ใช้ คืนค่าเป็น UTC (DB เก็บ UTC เสมอ) */
export function dayBoundsInTimeZone(date: Date, timeZone: string): { start: Date; end: Date } {
  const ymd = formatInTimeZone(date, timeZone);
  const start = zonedTimeToUtc(`${ymd}T00:00:00`, timeZone);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

/** ช่วงเวลาของเดือนหนึ่งตามโซนเวลาของผู้ใช้ — `[start, end)` เป็น UTC */
export interface MonthBounds {
  /** 'YYYY-MM' */
  period: string;
  start: Date;
  /** ต้นเดือนถัดไป (exclusive) */
  end: Date;
  daysInMonth: number;
}

/** 'YYYY-MM' ที่ถูกต้อง (เดือน 01–12) */
export const PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

function boundsOf(year: number, month: number, timeZone: string): MonthBounds {
  const pad = (n: number) => String(n).padStart(2, '0');
  const next = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 };
  return {
    period: `${year}-${pad(month)}`,
    // ต้นเดือนตามหน้าปัดของผู้ใช้ — ไม่ใช่ 00:00 UTC (ไทย = 17:00 ของวันก่อนหน้าใน UTC)
    start: zonedTimeToUtc(`${year}-${pad(month)}-01T00:00:00`, timeZone),
    end: zonedTimeToUtc(`${next.y}-${pad(next.m)}-01T00:00:00`, timeZone),
    daysInMonth: new Date(Date.UTC(year, month, 0)).getUTCDate(),
  };
}

/** เดือนที่ `date` อยู่ ตามโซนเวลาของผู้ใช้ */
export function monthBoundsInTimeZone(date: Date, timeZone: string): MonthBounds {
  const [y, m] = formatInTimeZone(date, timeZone).split('-').map(Number);
  return boundsOf(y!, m!, timeZone);
}

/** ขอบของเดือนจาก 'YYYY-MM' · `shift` เลื่อนไปกี่เดือน (ติดลบ = ย้อนหลัง) */
export function periodBounds(period: string, timeZone: string, shift = 0): MonthBounds {
  if (!PERIOD_PATTERN.test(period)) throw new RangeError(`period ไม่ถูกต้อง: ${period}`);
  const [y, m] = period.split('-').map(Number);
  const index = y! * 12 + (m! - 1) + shift;
  return boundsOf(Math.floor(index / 12), (index % 12) + 1, timeZone);
}

/** คืน 'YYYY-MM-DD' ของวันที่นั้นในโซนเวลาที่กำหนด */
export function formatInTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/**
 * แปลง "เวลาหน้านาฬิกา" ในโซนหนึ่ง เป็น Date (UTC จริง)
 * ใช้วิธีหา offset จากการ format กลับ — ถูกต้องข้าม DST โดยไม่ต้องพึ่งตาราง tz เอง
 */
export function zonedTimeToUtc(localIso: string, timeZone: string): Date {
  const naive = new Date(`${localIso}Z`);
  const offset = timeZoneOffsetMs(naive, timeZone);
  const firstGuess = new Date(naive.getTime() - offset);
  // ปรับอีกรอบเผื่อข้ามขอบ DST ระหว่างการเดาครั้งแรก
  const secondOffset = timeZoneOffsetMs(firstGuess, timeZone);
  return secondOffset === offset ? firstGuess : new Date(naive.getTime() - secondOffset);
}

/** offset ของโซนเวลา ณ เวลาหนึ่ง (มิลลิวินาที, บวก = เร็วกว่า UTC) */
export function timeZoneOffsetMs(at: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = dtf.formatToParts(at);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? '0');
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return asUtc - at.getTime();
}

/** วันเดียวกันไหมในโซนเวลาของผู้ใช้ */
export function isSameDayInTimeZone(a: Date, b: Date, timeZone: string): boolean {
  return formatInTimeZone(a, timeZone) === formatInTimeZone(b, timeZone);
}

/**
 * วันเวลาที่ client ส่งมา → Date จริง
 * Date (มี offset แล้ว) คงเดิม · 'YYYY-MM-DD' = 00:00 ของวันนั้น **ตามโซนผู้ใช้** (ไม่ใช่ 00:00 UTC)
 */
export function resolveDateInput(value: Date | string, timeZone: string): Date {
  if (value instanceof Date) return value;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new RangeError(`วันที่ไม่ถูกต้อง: ${value}`);
  return zonedTimeToUtc(`${value}T00:00:00`, timeZone);
}

/**
 * เลยกำหนดหรือยัง
 *  - งานทั้งวัน (isAllDay) = เลยเมื่อ **วันนั้นจบแล้ว** ตามโซนผู้ใช้ — กำหนดวันนี้ยังไม่เลยจนถึงเที่ยงคืน
 *  - งานมีเวลา = เลยเมื่อเลยเวลานั้น
 *  - เสร็จ / ยกเลิก / ข้าม = ไม่เลยกำหนด
 * ฝั่ง SQL ใช้เงื่อนไขเดียวกันใน apps/api/src/common/overdue-where.ts
 */
export function isEntryOverdue(
  entry: { occurredAt: Date | null; isAllDay: boolean; status: string },
  now: Date,
  timeZone: string,
): boolean {
  if (!entry.occurredAt || ['done', 'cancelled', 'skipped'].includes(entry.status)) return false;
  if (!entry.isAllDay) return entry.occurredAt.getTime() < now.getTime();
  return dayBoundsInTimeZone(entry.occurredAt, timeZone).end.getTime() <= now.getTime();
}

/** ชั่วโมงตามหน้าปัดของผู้ใช้ (0–23) */
export function localHour(now: Date, timeZone: string): number {
  const h = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    hourCycle: 'h23',
  }).format(now);
  return Number(h);
}

/**
 * คำทักทายหน้า Today (สเปก 8.11.1: เช้า < 12:00 ≤ บ่าย < 18:00 ≤ เย็น)
 * อยู่ใน core เพราะใช้สองฝั่ง: API ส่งใน GET /today · เว็บแสดงได้ทันทีจาก session โดยไม่รอ API
 * (รอแล้วข้อความยาวขึ้นบรรทัดใหม่ดันการ์ดทั้งแถวลง — CLS 0.39 · Phase 8)
 */
export function greetingFor(now: Date, timeZone: string, name: string, lang: Lang = 'th'): string {
  return text(lang, `greeting.${dayPart(now, timeZone)}`, { name })
    .trim()
    .replace(/,$/, '');
}

/** ช่วงของวันตามโซนผู้ใช้ — เว็บใช้เลือกคำทักทายตามภาษา (messages/*.json) */
export function dayPart(now: Date, timeZone: string): 'morning' | 'afternoon' | 'evening' {
  const h = localHour(now, timeZone);
  return h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening';
}
