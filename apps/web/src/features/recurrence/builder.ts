import type { PreviewDraftRuleInput, RecurrenceEndType } from '@nosion/contracts';

/**
 * ตัวสร้างกฎการเกิดซ้ำแบบไม่ต้องรู้ RFC 5545 (สเปก 15 Phase 3) — ส่วนนี้เป็นฟังก์ชันล้วน ทดสอบได้โดยไม่ต้อง render
 *
 * ผู้ใช้เลือก "ทุก n วัน/สัปดาห์/เดือน/ปี" + วันในสัปดาห์หรือวันที่ → แปลงเป็น RRULE body
 * ที่ API รับ (ไม่มี DTSTART/COUNT/UNTIL — engine คุมเองจาก startsAt และ endType)
 *
 * วันที่ 29–31 ไม่ต้องมีตัวเลือก "วันสุดท้ายของเดือน" แยก: engine clamp ให้แล้ว
 * (BYMONTHDAY=31 → ก.พ. ได้ 28/29 · เม.ย. ได้ 30)
 */

export type Frequency = 'daily' | 'weekly' | 'monthly' | 'yearly';
export type Weekday = 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU';

export const WEEKDAYS: readonly { value: Weekday; short: string; long: string }[] = [
  { value: 'MO', short: 'จ', long: 'จันทร์' },
  { value: 'TU', short: 'อ', long: 'อังคาร' },
  { value: 'WE', short: 'พ', long: 'พุธ' },
  { value: 'TH', short: 'พฤ', long: 'พฤหัสบดี' },
  { value: 'FR', short: 'ศ', long: 'ศุกร์' },
  { value: 'SA', short: 'ส', long: 'เสาร์' },
  { value: 'SU', short: 'อา', long: 'อาทิตย์' },
];

const UNIT: Record<Frequency, string> = {
  daily: 'วัน',
  weekly: 'สัปดาห์',
  monthly: 'เดือน',
  yearly: 'ปี',
};

const TH_MONTHS = [
  'ม.ค.',
  'ก.พ.',
  'มี.ค.',
  'เม.ย.',
  'พ.ค.',
  'มิ.ย.',
  'ก.ค.',
  'ส.ค.',
  'ก.ย.',
  'ต.ค.',
  'พ.ย.',
  'ธ.ค.',
];

export interface RecurrenceDraft {
  freq: Frequency;
  /** ทุก ๆ กี่หน่วย (1–366 ตาม engine) */
  interval: number;
  /** ใช้กับ weekly — ว่าง = วันเดียวกับวันเริ่ม */
  weekdays: Weekday[];
  /** ใช้กับ monthly (1–31) */
  monthDay: number;
  /** 'YYYY-MM-DD' ตามปฏิทินของผู้ใช้ — รอบเป็นรายการทั้งวัน */
  startsAt: string;
  endType: RecurrenceEndType;
  /** 'YYYY-MM-DD' ใช้เมื่อ endType=onDate */
  endsAt: string;
  /** ใช้เมื่อ endType=afterCount (1–1000) */
  maxCount: number;
}

/** วันในสัปดาห์ของ 'YYYY-MM-DD' — คิดจากตัวเลขล้วน ไม่ขึ้นกับโซนของเครื่อง */
export function weekdayOf(ymd: string): Weekday {
  const day = new Date(Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10)));
  // getUTCDay: 0 = อาทิตย์
  return WEEKDAYS[(day.getUTCDay() + 6) % 7]!.value;
}

/** ค่าเริ่มต้นที่เหมาะกับบิล: ทุกเดือน วันเดียวกับวันเริ่ม ไม่มีวันจบ */
export function defaultDraft(startsAt: string): RecurrenceDraft {
  return {
    freq: 'monthly',
    interval: 1,
    weekdays: [],
    monthDay: +startsAt.slice(8, 10),
    startsAt,
    endType: 'never',
    endsAt: '',
    maxCount: 12,
  };
}

/** RRULE body เช่น "FREQ=MONTHLY;BYMONTHDAY=31" */
export function buildRrule(draft: RecurrenceDraft): string {
  const parts = [`FREQ=${draft.freq.toUpperCase()}`];
  if (draft.interval > 1) parts.push(`INTERVAL=${draft.interval}`);
  if (draft.freq === 'weekly') {
    const days = draft.weekdays.length ? draft.weekdays : [weekdayOf(draft.startsAt)];
    // เรียงตามสัปดาห์ — rrule เดียวกันได้สตริงเดียวกันเสมอไม่ว่าผู้ใช้กดลำดับไหน
    const ordered = WEEKDAYS.map((w) => w.value).filter((w) => days.includes(w));
    parts.push(`BYDAY=${ordered.join(',')}`);
  }
  if (draft.freq === 'monthly') parts.push(`BYMONTHDAY=${draft.monthDay}`);
  // yearly: engine ใช้วัน/เดือนของ startsAt และ clamp 29 ก.พ. ให้เอง
  return parts.join(';');
}

export type DraftErrors = Partial<
  Record<'interval' | 'monthDay' | 'startsAt' | 'endsAt' | 'maxCount', string>
>;

/** ตรวจก่อนยิง preview — ข้อผิดพลาดที่ engine จะตอบ 422 อยู่ดี แต่บอกผู้ใช้ได้ทันทีโดยไม่ต้องรอเครือข่าย */
export function validateDraft(draft: RecurrenceDraft): DraftErrors {
  const errors: DraftErrors = {};
  if (!Number.isInteger(draft.interval) || draft.interval < 1 || draft.interval > 366) {
    errors.interval = 'ใส่ตัวเลข 1–366';
  }
  if (
    draft.freq === 'monthly' &&
    (!Number.isInteger(draft.monthDay) || draft.monthDay < 1 || draft.monthDay > 31)
  ) {
    errors.monthDay = 'เลือกวันที่ 1–31';
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.startsAt)) errors.startsAt = 'เลือกวันเริ่ม';
  if (draft.endType === 'onDate') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.endsAt)) errors.endsAt = 'เลือกวันสิ้นสุด';
    else if (draft.endsAt < draft.startsAt) errors.endsAt = 'วันสิ้นสุดต้องไม่ก่อนวันเริ่ม';
  }
  if (
    draft.endType === 'afterCount' &&
    (!Number.isInteger(draft.maxCount) || draft.maxCount < 1 || draft.maxCount > 1000)
  ) {
    errors.maxCount = 'ใส่จำนวนครั้ง 1–1000';
  }
  return errors;
}

/** รูปที่ส่งให้ POST /recurrence-rules และ /recurrence-rules/preview (ไม่ส่ง timezone = ใช้โซนของผู้ใช้) */
export function toRuleInput(
  draft: RecurrenceDraft,
): Omit<PreviewDraftRuleInput, 'limit' | 'timezone'> {
  return {
    rrule: buildRrule(draft),
    startsAt: draft.startsAt,
    endType: draft.endType,
    ...(draft.endType === 'onDate' ? { endsAt: draft.endsAt } : {}),
    ...(draft.endType === 'afterCount' ? { maxCount: draft.maxCount } : {}),
  };
}

/** 'YYYY-MM-DD' → "5 มี.ค. 2027" (ปี ค.ศ. ให้ตรงกับช่องเลือกวันที่ของเบราว์เซอร์) */
export function formatLocalDate(ymd: string, withYear = true): string {
  const day = +ymd.slice(8, 10);
  const month = TH_MONTHS[+ymd.slice(5, 7) - 1];
  return withYear ? `${day} ${month} ${ymd.slice(0, 4)}` : `${day} ${month}`;
}

/** สรุปเป็นประโยคเดียว เช่น "ทุกเดือน วันที่ 31 · ไม่มีวันสิ้นสุด" — ให้ผู้ใช้ทวนก่อนบันทึก */
export function describeDraft(draft: RecurrenceDraft): string {
  const every =
    draft.interval > 1 ? `ทุก ${draft.interval} ${UNIT[draft.freq]}` : `ทุก${UNIT[draft.freq]}`;
  let when = '';
  if (draft.freq === 'weekly') {
    const days = draft.weekdays.length ? draft.weekdays : [weekdayOf(draft.startsAt)];
    const names = WEEKDAYS.filter((w) => days.includes(w.value)).map((w) => w.long);
    when = names.length === 7 ? ' ทุกวันในสัปดาห์' : ` วัน${names.join(' ')}`;
  } else if (draft.freq === 'monthly') {
    when = ` วันที่ ${draft.monthDay}${draft.monthDay > 28 ? ' (เดือนที่สั้นกว่าใช้วันสุดท้าย)' : ''}`;
  } else if (draft.freq === 'yearly' && /^\d{4}-\d{2}-\d{2}$/.test(draft.startsAt)) {
    when = ` วันที่ ${formatLocalDate(draft.startsAt, false)}`;
  }
  const end =
    draft.endType === 'afterCount'
      ? `${draft.maxCount} ครั้ง`
      : draft.endType === 'onDate' && draft.endsAt
        ? `ถึง ${formatLocalDate(draft.endsAt)}`
        : 'ไม่มีวันสิ้นสุด';
  return `${every}${when} · ${end}`;
}
