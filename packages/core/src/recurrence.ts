/**
 * Recurrence Engine (ส่วนคำนวณล้วน) — สเปก 6.1
 *
 * แปลง RecurrenceRule เป็น "slot" (เวลา UTC ของแต่ละรอบ) โดยไม่แตะฐานข้อมูล
 * ส่วนที่เขียนลง DB (lazy materialization) อยู่ฝั่ง API และเรียกฟังก์ชันในไฟล์นี้
 *
 * แนวคิดหลัก: คำนวณใน "เวลาหน้าปัด" ของโซนเวลาของ rule ก่อน แล้วค่อยแปลงเป็น UTC ทีละรอบ
 * - rrule.js ถูกใช้แบบ "floating time": ฟิลด์ UTC ของ Date = เวลาหน้าปัดในโซนของผู้ใช้
 *   (ไม่ใช้ตัวเลือก tzid ของ rrule.js เพราะพฤติกรรมข้าม DST ไม่น่าไว้ใจ)
 * - แต่ละรอบแปลงเป็น UTC ด้วย zonedTimeToUtc → "ทุกวัน 9 โมง New York" ได้ 14:00 UTC ฤดูหนาว และ 13:00 UTC ฤดูร้อน
 * - วันที่ที่ไม่มีในเดือน (31 ใน ก.พ.) ใช้นโยบาย clamp → วันสุดท้ายของเดือน
 */
import { RRule, Frequency, type Options } from 'rrule';
import { zonedTimeToUtc } from './time';

export type RecurrenceEnd =
  { type: 'never' } | { type: 'onDate'; endsAt: Date } | { type: 'afterCount'; maxCount: number };

/** ข้อมูลที่ engine ต้องใช้ — ตรงกับคอลัมน์ของตาราง recurrence_rules */
export interface RecurrenceSpec {
  /** RFC 5545 RRULE ไม่มี DTSTART/UNTIL/COUNT เช่น "FREQ=MONTHLY;BYMONTHDAY=31" */
  rrule: string;
  /** รอบแรก (UTC) — เวลาหน้าปัดของค่านี้ในโซน `timezone` คือเวลาของทุกรอบ */
  startsAt: Date;
  /** IANA เช่น "Asia/Bangkok" */
  timezone: string;
  end: RecurrenceEnd;
  /** รอบที่ถูกลบออก (EXDATE) เก็บเป็นเวลา UTC ของ slot นั้น */
  exceptions?: readonly Date[];
}

/** FREQ ที่ยอมรับ — ต่ำกว่ารายวันจะสร้าง entry ระเบิดจำนวน และไม่มี use case ในแอปนี้ */
const ALLOWED_FREQ = new Set([
  Frequency.DAILY,
  Frequency.WEEKLY,
  Frequency.MONTHLY,
  Frequency.YEARLY,
]);

/** ส่วนที่ผู้ใช้ห้ามใส่เอง — engine คุมเองจาก startsAt / timezone / end */
const FORBIDDEN_PARTS = /(^|;)\s*(DTSTART|UNTIL|COUNT|TZID|BYHOUR|BYMINUTE|BYSECOND)\s*=/i;

/** ขีดจำกัดเพื่อกันการคำนวณไม่จบ (เช่น ขอ preview ช่วง 100 ปีของกฎรายวัน) */
export const MAX_OCCURRENCES_PER_CALL = 1000;

export class RecurrenceRuleError extends Error {
  override name = 'RecurrenceRuleError';
}

/**
 * ตรวจและแยก RRULE — โยน RecurrenceRuleError พร้อมเหตุผลภาษาไทยถ้าใช้ไม่ได้
 * คืนค่า options ที่ยังไม่มี dtstart
 */
export function parseRecurrenceRule(rrule: string): Partial<Options> {
  const body = rrule.trim().replace(/^RRULE:/i, '');
  if (!body) throw new RecurrenceRuleError('ต้องระบุ rrule');
  if (FORBIDDEN_PARTS.test(body)) {
    throw new RecurrenceRuleError(
      'rrule ห้ามมี DTSTART / UNTIL / COUNT / TZID / BYHOUR / BYMINUTE / BYSECOND — ใช้ startsAt, timezone และ endType แทน',
    );
  }
  let options: Partial<Options>;
  try {
    options = RRule.parseString(body);
  } catch {
    throw new RecurrenceRuleError(`อ่าน rrule ไม่ได้: ${body}`);
  }
  if (options.freq === undefined || !ALLOWED_FREQ.has(options.freq)) {
    throw new RecurrenceRuleError('รองรับเฉพาะ FREQ=DAILY, WEEKLY, MONTHLY, YEARLY');
  }
  if (options.interval !== undefined && (options.interval < 1 || options.interval > 366)) {
    throw new RecurrenceRuleError('INTERVAL ต้องอยู่ระหว่าง 1–366');
  }
  return options;
}

/** ตรวจว่าเป็น IANA timezone ที่ runtime รู้จัก */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(0);
    return true;
  } catch {
    return false;
  }
}

/** แปลงเวลา UTC จริง → Date แบบ floating (ฟิลด์ UTC = เวลาหน้าปัดใน `timeZone`) */
export function toFloating(instant: Date, timeZone: string): Date {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value);
  return new Date(
    Date.UTC(
      get('year'),
      get('month') - 1,
      get('day'),
      get('hour'),
      get('minute'),
      get('second'),
      instant.getUTCMilliseconds(),
    ),
  );
}

/** แปลง Date แบบ floating กลับเป็นเวลา UTC จริงตามโซน — ข้าม DST ถูกต้องด้วย zonedTimeToUtc */
export function fromFloating(floating: Date, timeZone: string): Date {
  return zonedTimeToUtc(floating.toISOString().slice(0, 19), timeZone);
}

/**
 * นโยบาย clamp: "ทุกวันที่ 31" ในเดือนที่มี 30 วัน → วันที่ 30 · ก.พ. → 28 (29 ปีอธิกสุรทิน)
 *
 * rrule มาตรฐานจะ "ข้าม" เดือนที่ไม่มีวันนั้น จึงแปลงเป็น BYMONTHDAY=28,..,d;BYSETPOS=-1
 * = "วันสุดท้ายในชุด 28..d ที่มีอยู่จริงในเดือนนั้น" ซึ่งคือ min(d, วันสุดท้ายของเดือน) พอดี
 */
function applyMonthEndClamp(options: Partial<Options>, dtstart: Date): Partial<Options> {
  const result = { ...options };
  const hasWeekday = result.byweekday !== undefined && result.byweekday !== null;
  const hasSetPos = result.bysetpos !== undefined && result.bysetpos !== null;
  if (hasWeekday || hasSetPos) return result; // "พฤหัสสุดท้ายของเดือน" ฯลฯ — ไม่ใช่เรื่อง clamp

  const asArray = (v: number | number[] | null | undefined): number[] =>
    v === undefined || v === null ? [] : Array.isArray(v) ? v : [v];

  if (result.freq === Frequency.MONTHLY || result.freq === Frequency.YEARLY) {
    let days = asArray(result.bymonthday);
    // ไม่ระบุวัน → rrule ใช้วันของ dtstart ซึ่งก็ต้อง clamp เช่นกัน
    if (days.length === 0) days = [dtstart.getUTCDate()];
    if (result.freq === Frequency.YEARLY && asArray(result.bymonth).length === 0) {
      result.bymonth = [dtstart.getUTCMonth() + 1];
    }
    const months = asArray(result.bymonth);
    // BYSETPOS ทำงานต่อ "ช่วงของ FREQ" → ใช้ได้เฉพาะเมื่อแต่ละช่วงมีวันเป้าหมายวันเดียว
    const singleTargetPerPeriod =
      days.length === 1 && (result.freq === Frequency.MONTHLY || months.length === 1);
    const day = days[0]!;
    if (singleTargetPerPeriod && day > 28) {
      result.bymonthday = Array.from({ length: day - 27 }, (_, i) => 28 + i);
      result.bysetpos = [-1];
    } else {
      result.bymonthday = days;
    }
  }
  return result;
}

function sameInstant(a: Date, b: Date): boolean {
  return a.getTime() === b.getTime();
}

function buildRule(spec: RecurrenceSpec): RRule {
  if (!isValidTimeZone(spec.timezone)) {
    throw new RecurrenceRuleError(`timezone ไม่ถูกต้อง: ${spec.timezone}`);
  }
  if (Number.isNaN(spec.startsAt.getTime())) throw new RecurrenceRuleError('startsAt ไม่ถูกต้อง');
  const dtstart = toFloating(spec.startsAt, spec.timezone);
  const options = applyMonthEndClamp(parseRecurrenceRule(spec.rrule), dtstart);
  // COUNT นับตั้งแต่รอบแรกของ series เสมอ — ไม่ว่าจะ materialize เป็นช่วง ๆ กี่ครั้ง ก็ไม่เกิน maxCount
  const count = spec.end.type === 'afterCount' ? spec.end.maxCount : null;
  if (count !== null && (!Number.isInteger(count) || count < 1)) {
    throw new RecurrenceRuleError('maxCount ต้องเป็นจำนวนเต็มบวก');
  }
  return new RRule({ ...options, dtstart, count, tzid: null, until: null });
}

/**
 * รอบทั้งหมดในช่วง `(after, until]` เป็นเวลา UTC เรียงจากเก่าไปใหม่
 *
 * ใช้ช่วงเปิดด้านซ้าย เพื่อให้เรียกต่อกันได้ไม่ซ้ำ: `(a, b]` แล้ว `(b, c]` — lazy materialization
 * เก็บ `b` ไว้เป็น `materializedUntil` แล้วเรียกรอบหน้าจาก `b`
 * `after = null` = เริ่มจากรอบแรกของ series (รวม startsAt)
 */
export function occurrencesBetween(spec: RecurrenceSpec, after: Date | null, until: Date): Date[] {
  const rule = buildRule(spec);
  // ช่วงในเวลาหน้าปัดกว้างกว่าจริง 2 วัน (offset ไม่เกิน ±14 ชม.) แล้วกรองด้วยเวลา UTC จริงอีกที
  const margin = 2 * 24 * 60 * 60 * 1000;
  const lower = after ? new Date(toFloating(after, spec.timezone).getTime() - margin) : null;
  const upper = new Date(toFloating(until, spec.timezone).getTime() + margin);

  const floating: Date[] = [];
  const collect = (d: Date) => {
    if (floating.length >= MAX_OCCURRENCES_PER_CALL + 64) return false;
    floating.push(d);
    return true;
  };
  if (lower) rule.between(lower, upper, true, (d) => collect(d));
  else rule.between(new Date(rule.options.dtstart.getTime() - 1), upper, true, (d) => collect(d));

  const exceptions = spec.exceptions ?? [];
  const endsAt = spec.end.type === 'onDate' ? spec.end.endsAt : null;

  const result: Date[] = [];
  for (const f of floating) {
    const slot = fromFloating(f, spec.timezone);
    if (after && slot.getTime() <= after.getTime()) continue;
    if (slot.getTime() > until.getTime()) continue;
    if (endsAt && slot.getTime() > endsAt.getTime()) continue;
    if (exceptions.some((e) => sameInstant(e, slot))) continue;
    result.push(slot);
    if (result.length > MAX_OCCURRENCES_PER_CALL) {
      throw new RecurrenceRuleError(
        `ช่วงเวลากว้างเกินไป — เกิน ${MAX_OCCURRENCES_PER_CALL} รอบต่อการเรียกหนึ่งครั้ง`,
      );
    }
  }
  return result;
}

/**
 * รอบถัดไป `limit` รอบ หลังเวลา `after` (ไม่รวม) — ใช้กับ preview "10 รอบถัดไป"
 * ข้าม exceptions และเคารพเงื่อนไขสิ้นสุด
 */
export function nextOccurrences(spec: RecurrenceSpec, after: Date, limit = 10): Date[] {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new RecurrenceRuleError('limit ต้องอยู่ระหว่าง 1–100');
  }
  const rule = buildRule(spec);
  const exceptions = spec.exceptions ?? [];
  const endsAt = spec.end.type === 'onDate' ? spec.end.endsAt : null;
  const result: Date[] = [];
  // เริ่มก่อนจริง 2 วันในเวลาหน้าปัด แล้วกรองด้วย UTC — เหตุผลเดียวกับ occurrencesBetween
  let cursor = new Date(
    Math.max(
      toFloating(after, spec.timezone).getTime() - 2 * 86_400_000,
      rule.options.dtstart.getTime() - 1,
    ),
  );
  let guard = 0;
  while (result.length < limit && guard < MAX_OCCURRENCES_PER_CALL) {
    const next = rule.after(cursor, false);
    if (!next) break;
    cursor = next;
    guard += 1;
    const slot = fromFloating(next, spec.timezone);
    if (slot.getTime() <= after.getTime()) continue;
    if (endsAt && slot.getTime() > endsAt.getTime()) break;
    if (exceptions.some((e) => sameInstant(e, slot))) continue;
    result.push(slot);
  }
  return result;
}

/**
 * หา slot ของรอบที่ตกใน "วันที่หน้าปัด" `ymd` ('YYYY-MM-DD') ตามโซนของ rule
 * ใช้กับ `DELETE /recurrence-rules/:id/occurrences/:date` — ผู้ใช้ระบุเป็นวัน ไม่ใช่ timestamp
 */
export function slotOnLocalDate(spec: RecurrenceSpec, ymd: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) throw new RecurrenceRuleError(`วันที่ไม่ถูกต้อง: ${ymd}`);
  const dayStart = zonedTimeToUtc(`${ymd}T00:00:00`, spec.timezone);
  const dayEnd = new Date(dayStart.getTime() + 36 * 60 * 60 * 1000);
  const candidates = occurrencesBetween(
    { ...spec, exceptions: [] },
    new Date(dayStart.getTime() - 1),
    dayEnd,
  );
  return (
    candidates.find((slot) => toFloating(slot, spec.timezone).toISOString().slice(0, 10) === ymd) ??
    null
  );
}
