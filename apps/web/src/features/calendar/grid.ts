import type { CalendarEventDto } from '@nosion/contracts';
import { zonedTimeToUtc } from '@nosion/core/time';

/**
 * คำนวณของหน้าปฏิทิน (สเปก 8.11.4) — pure ทั้งไฟล์ ทำงานกับ 'YYYY-MM-DD' ล้วน
 * ไม่ใช้ Date ของเครื่อง (setDate/getDay ตามโซนเครื่อง) — วันที่ทุกตัวมาจาก API ตามโซนผู้ใช้แล้ว
 */

export const CALENDAR_VIEWS = ['month', 'week', 'agenda'] as const;
export type CalendarView = (typeof CALENDAR_VIEWS)[number];

const TH_MONTHS = [
  'มกราคม',
  'กุมภาพันธ์',
  'มีนาคม',
  'เมษายน',
  'พฤษภาคม',
  'มิถุนายน',
  'กรกฎาคม',
  'สิงหาคม',
  'กันยายน',
  'ตุลาคม',
  'พฤศจิกายน',
  'ธันวาคม',
];
/** อา–ส ตาม getUTCDay() */
export const TH_WEEKDAYS_SHORT = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
const TH_WEEKDAYS_LONG = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];

const asDate = (ymd: string) => new Date(`${ymd}T00:00:00Z`);
const pad = (n: number) => String(n).padStart(2, '0');

export function addDays(ymd: string, n: number): string {
  const d = asDate(ymd);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const weekdayOf = (ymd: string) => asDate(ymd).getUTCDay();

export function startOfWeek(ymd: string, weekStartsOn: number): string {
  return addDays(ymd, -((weekdayOf(ymd) - weekStartsOn + 7) % 7));
}

/** สัปดาห์ ISO 8601 (สัปดาห์ที่มีวันพฤหัสแรกของปีคือ W1) */
export function isoWeek(ymd: string): number {
  const d = asDate(ymd);
  const thursday = addDays(ymd, 3 - ((d.getUTCDay() + 6) % 7));
  const yearStart = Date.UTC(Number(thursday.slice(0, 4)), 0, 1);
  return Math.floor((asDate(thursday).getTime() - yearStart) / 86_400_000 / 7) + 1;
}

/** 'YYYY-MM-DD' ของวันนี้ตามโซน */
export function todayIn(timeZone: string, now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(now);
}

/** grid เดือน 6 สัปดาห์ (42 วัน) เริ่มที่ต้นสัปดาห์ของวันที่ 1 — ความสูงคงที่ทุกเดือน ไม่กระโดด */
export function monthGridDays(anchor: string, weekStartsOn: number): string[] {
  const first = `${anchor.slice(0, 7)}-01`;
  const start = startOfWeek(first, weekStartsOn);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

export function weekDays(anchor: string, weekStartsOn: number): string[] {
  const start = startOfWeek(anchor, weekStartsOn);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** ช่วงที่ต้องขอจาก API · month กับ agenda ใช้ grid เดียวกัน (แคชร่วมกัน สลับ view ไม่โหลดใหม่) */
export function viewRange(
  view: CalendarView,
  anchor: string,
  weekStartsOn: number,
): { from: string; to: string; days: string[] } {
  const days =
    view === 'week' ? weekDays(anchor, weekStartsOn) : monthGridDays(anchor, weekStartsOn);
  return { from: days[0]!, to: days.at(-1)!, days };
}

/** ‹ › — month/agenda เลื่อนทีละเดือน (ไปวันที่ 1) · week ทีละ 7 วัน */
export function shiftAnchor(view: CalendarView, anchor: string, direction: 1 | -1): string {
  if (view === 'week') return addDays(anchor, 7 * direction);
  const index = Number(anchor.slice(0, 4)) * 12 + Number(anchor.slice(5, 7)) - 1 + direction;
  return `${Math.floor(index / 12)}-${pad((index % 12) + 1)}-01`;
}

export const sameMonth = (a: string, b: string) => a.slice(0, 7) === b.slice(0, 7);

/** "ตุลาคม 2026" */
export function monthTitle(ymd: string): string {
  return `${TH_MONTHS[Number(ymd.slice(5, 7)) - 1]} ${ymd.slice(0, 4)}`;
}

/** "W40 – W44" ของช่วงที่แสดง */
export function weekRangeLabel(days: string[]): string {
  const first = isoWeek(days[0]!);
  const last = isoWeek(days.at(-1)!);
  return first === last ? `W${first}` : `W${first} – W${last}`;
}

/** "วันพุธ 21 ตุลาคม 2026" */
export function longDayLabel(ymd: string): string {
  return `วัน${TH_WEEKDAYS_LONG[weekdayOf(ymd)]} ${Number(ymd.slice(8, 10))} ${monthTitle(ymd)}`;
}

/** 'HH:mm' ของ event ตามโซนผู้ใช้ */
export function timeOf(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso));
}

export function groupByDate(events: CalendarEventDto[]): Map<string, CalendarEventDto[]> {
  const map = new Map<string, CalendarEventDto[]>();
  for (const e of events) map.set(e.date, [...(map.get(e.date) ?? []), e]);
  return map;
}

export interface WeekSnapshot {
  tasksDone: number;
  tasksTotal: number;
  /** ยอดบิลที่ยังไม่จ่ายในสัปดาห์ (หน่วยย่อย) */
  dueMinor: number;
  currency: string;
  /** บิลค้างจ่ายถัดไปอีกกี่วัน (นับจากวันนี้ ในช่วงที่โหลดมา) · null = ไม่มี */
  nextDueInDays: number | null;
}

/**
 * Quick Snapshot ของสัปดาห์ที่เลือก — คำนวณจาก events ที่โหลดมาแล้ว (ตัวเลขตรงกับ grid เสมอ)
 * ใช้ field ทั่วไปของ event + meta.amountMinor ที่โมดูลการเงินแนบมา
 */
export function weekSnapshot(
  events: CalendarEventDto[],
  week: string[],
  today: string,
): WeekSnapshot {
  const inWeek = events.filter((e) => week.includes(e.date));
  const tasks = inWeek.filter((e) => e.module === 'task');
  const unpaid = (e: CalendarEventDto) =>
    e.module === 'expense' && e.status !== 'done' && typeof e.meta.amountMinor === 'number';
  const nextDue = events
    .filter((e) => unpaid(e) && e.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  return {
    tasksDone: tasks.filter((e) => e.status === 'done').length,
    tasksTotal: tasks.length,
    dueMinor: inWeek.filter(unpaid).reduce((sum, e) => sum + (e.meta.amountMinor as number), 0),
    currency: (inWeek.find(unpaid)?.meta.currency as string | undefined) ?? 'THB',
    nextDueInDays: nextDue
      ? Math.round((asDate(nextDue.date).getTime() - asDate(today).getTime()) / 86_400_000)
      : null,
  };
}

/** ลาก/ย้ายได้ไหม — ต้องมี entry จริง (projected ยังไม่มีให้แก้) และยังไม่จบ */
export function canMove(event: CalendarEventDto): boolean {
  return event.entryId !== null && event.version !== null && event.status !== 'done';
}

/**
 * ย้ายรายการไปวันอื่นโดย "คงเวลาหน้าปัด" (สเปก 8.11.4 ลากเปลี่ยนวัน)
 *  - ทั้งวัน → ส่ง 'YYYY-MM-DD' ให้ API ตีความเป็นต้นวันตามโซนผู้ใช้
 *  - มีเวลา  → 10:00 วันเดิม = 10:00 วันใหม่ ตามโซนผู้ใช้ (ข้าม DST ก็ยังเป็น 10:00)
 * คืน `start` ไว้อัปเดตแคชแบบ optimistic ด้วย · วันเดิม = null (ไม่ต้องยิง API)
 */
export function moveTarget(
  event: CalendarEventDto,
  toDate: string,
  timeZone: string,
): { occurredAt: string; start: string } | null {
  if (event.date === toDate) return null;
  if (event.allDay) {
    return {
      occurredAt: toDate,
      start: zonedTimeToUtc(`${toDate}T00:00:00`, timeZone).toISOString(),
    };
  }
  const start = zonedTimeToUtc(
    `${toDate}T${timeOf(event.start, timeZone)}:00`,
    timeZone,
  ).toISOString();
  return { occurredAt: start, start };
}
