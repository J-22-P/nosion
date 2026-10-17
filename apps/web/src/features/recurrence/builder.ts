import type { PreviewDraftRuleInput, RecurrenceEndType } from '@nosion/contracts';
import { currentLocale, tr } from '@/i18n/current';
import { dateTimeFormat } from '@nosion/core/intl';

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

/** index ของ getUTCDay() (อา=0) — ใช้ดึงชื่อย่อวันชุดเดียวกับปฏิทิน */
const DAY_INDEX: Record<Weekday, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

/** ชื่อเป็น getter — อ่านตามภาษาปัจจุบันตอนใช้ */
export const WEEKDAYS: readonly {
  value: Weekday;
  readonly short: string;
  readonly long: string;
}[] = (['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as const).map((value) => ({
  value,
  get short() {
    return tr(`calendar.weekdayShort.${DAY_INDEX[value]}`);
  },
  get long() {
    return tr(`rb.weekdayLong.${value}`);
  },
}));

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
    errors.interval = tr('rb.err.interval');
  }
  if (
    draft.freq === 'monthly' &&
    (!Number.isInteger(draft.monthDay) || draft.monthDay < 1 || draft.monthDay > 31)
  ) {
    errors.monthDay = tr('rb.err.monthDay');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.startsAt)) errors.startsAt = tr('rb.err.startsAt');
  if (draft.endType === 'onDate') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.endsAt)) errors.endsAt = tr('rb.err.endsAt');
    else if (draft.endsAt < draft.startsAt) errors.endsAt = tr('rb.err.endsBeforeStart');
  }
  if (
    draft.endType === 'afterCount' &&
    (!Number.isInteger(draft.maxCount) || draft.maxCount < 1 || draft.maxCount > 1000)
  ) {
    errors.maxCount = tr('rb.err.maxCount');
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

/** 'YYYY-MM-DD' → "5 มี.ค. 2027" · "Mar 5, 2027" (ปี ค.ศ. เสมอ ให้ตรงกับช่องเลือกวันที่ของเบราว์เซอร์) */
export function formatLocalDate(ymd: string, withYear = true): string {
  const locale = currentLocale() === 'en' ? 'en-US' : 'th-TH-u-ca-gregory';
  return dateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    ...(withYear ? { year: 'numeric' as const } : {}),
    timeZone: 'UTC',
  }).format(new Date(`${ymd}T00:00:00Z`));
}

/** สรุปเป็นประโยคเดียว เช่น "ทุกเดือน วันที่ 31 · ไม่มีวันสิ้นสุด" — ให้ผู้ใช้ทวนก่อนบันทึก */
export function describeDraft(draft: RecurrenceDraft): string {
  // ประโยคเดียวกับ ⌘K (rrule.*) — "ทุกเดือน" · "ทุก 2 สัปดาห์" · "Every 2 weeks"
  const every = tr(`rrule.${draft.freq}`, { n: draft.interval });
  let when = '';
  if (draft.freq === 'weekly') {
    const days = draft.weekdays.length ? draft.weekdays : [weekdayOf(draft.startsAt)];
    const names = WEEKDAYS.filter((w) => days.includes(w.value)).map((w) => w.long);
    when =
      names.length === 7
        ? tr('rb.everyDayOfWeek')
        : tr('rb.onWeekdays', { days: names.join(tr('rb.weekdaySeparator')) });
  } else if (draft.freq === 'monthly') {
    when = `${tr('rb.onMonthDay', { day: draft.monthDay })}${draft.monthDay > 28 ? tr('rb.clampNote') : ''}`;
  } else if (draft.freq === 'yearly' && /^\d{4}-\d{2}-\d{2}$/.test(draft.startsAt)) {
    when = tr('rb.onDate', { date: formatLocalDate(draft.startsAt, false) });
  }
  const end =
    draft.endType === 'afterCount'
      ? tr('rb.times', { count: draft.maxCount })
      : draft.endType === 'onDate' && draft.endsAt
        ? tr('rb.until', { date: formatLocalDate(draft.endsAt) })
        : tr('rb.noEnd');
  return `${every}${when} · ${end}`;
}
