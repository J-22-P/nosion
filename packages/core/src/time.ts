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

/** เลยกำหนดหรือยัง — งานที่ทำเสร็จแล้วไม่นับว่าเลยกำหนด */
export function isOverdue(occurredAt: Date | null, now: Date, isDone: boolean): boolean {
  if (isDone || !occurredAt) return false;
  return occurredAt.getTime() < now.getTime();
}
