import { nextOccurrences, parseRecurrenceRule, toFloating } from '@nosion/core/recurrence';
import { resolveDateInput } from '@nosion/core/time';
import { describe, expect, it } from 'vitest';
import {
  buildRrule,
  defaultDraft,
  describeDraft,
  toRuleInput,
  validateDraft,
  weekdayOf,
  type RecurrenceDraft,
} from './builder';

const draft = (patch: Partial<RecurrenceDraft> = {}): RecurrenceDraft => ({
  ...defaultDraft('2027-01-31'),
  ...patch,
});

describe('buildRrule', () => {
  it('ค่าเริ่มต้นของบิล = ทุกเดือนวันเดียวกับวันเริ่ม (DoD: วันที่ 31)', () => {
    expect(buildRrule(draft())).toBe('FREQ=MONTHLY;BYMONTHDAY=31');
  });

  it.each([
    [{ freq: 'daily' as const }, 'FREQ=DAILY'],
    [{ freq: 'daily' as const, interval: 3 }, 'FREQ=DAILY;INTERVAL=3'],
    [
      { freq: 'monthly' as const, interval: 2, monthDay: 5 },
      'FREQ=MONTHLY;INTERVAL=2;BYMONTHDAY=5',
    ],
    [{ freq: 'yearly' as const }, 'FREQ=YEARLY'],
  ])('%o → %s', (patch, expected) => {
    expect(buildRrule(draft(patch))).toBe(expected);
  });

  it('weekly เรียงวันตามสัปดาห์ไม่ว่ากดลำดับไหน', () => {
    expect(buildRrule(draft({ freq: 'weekly', weekdays: ['FR', 'MO', 'WE'] }))).toBe(
      'FREQ=WEEKLY;BYDAY=MO,WE,FR',
    );
  });

  it('weekly ไม่เลือกวัน → ใช้วันของวันเริ่ม', () => {
    // 31 ม.ค. 2027 เป็นวันอาทิตย์
    expect(buildRrule(draft({ freq: 'weekly' }))).toBe('FREQ=WEEKLY;BYDAY=SU');
  });
});

describe('weekdayOf', () => {
  it.each([
    ['2027-01-31', 'SU'],
    ['2027-02-01', 'MO'],
    ['2024-02-29', 'TH'],
  ])('%s → %s', (ymd, expected) => {
    expect(weekdayOf(ymd)).toBe(expected);
  });
});

describe('validateDraft', () => {
  it('ค่าเริ่มต้นผ่าน', () => {
    expect(validateDraft(draft())).toEqual({});
  });

  it.each([
    ['interval 0', { interval: 0 }, 'interval'],
    ['interval เกิน', { interval: 400 }, 'interval'],
    ['วันที่ 32', { monthDay: 32 }, 'monthDay'],
    ['ไม่มีวันเริ่ม', { startsAt: '' }, 'startsAt'],
    ['onDate ไม่มีวันจบ', { endType: 'onDate' as const, endsAt: '' }, 'endsAt'],
    ['วันจบก่อนวันเริ่ม', { endType: 'onDate' as const, endsAt: '2027-01-01' }, 'endsAt'],
    ['afterCount 0', { endType: 'afterCount' as const, maxCount: 0 }, 'maxCount'],
  ])('%s → error ที่ %s', (_name, patch, field) => {
    expect(Object.keys(validateDraft(draft(patch)))).toEqual([field]);
  });

  it('monthDay ไม่ถูกตรวจเมื่อไม่ใช่ monthly', () => {
    expect(validateDraft(draft({ freq: 'daily', monthDay: 0 }))).toEqual({});
  });
});

describe('toRuleInput', () => {
  it('ส่งเฉพาะฟิลด์ของ endType ที่เลือก', () => {
    expect(toRuleInput(draft())).toEqual({
      rrule: 'FREQ=MONTHLY;BYMONTHDAY=31',
      startsAt: '2027-01-31',
      endType: 'never',
    });
    expect(toRuleInput(draft({ endType: 'afterCount', maxCount: 5 }))).toMatchObject({
      endType: 'afterCount',
      maxCount: 5,
    });
    expect(toRuleInput(draft({ endType: 'onDate', endsAt: '2027-12-31' }))).not.toHaveProperty(
      'maxCount',
    );
  });
});

describe('describeDraft', () => {
  it.each([
    [{}, 'ทุกเดือน วันที่ 31 (เดือนที่สั้นกว่าใช้วันสุดท้าย) · ไม่มีวันสิ้นสุด'],
    [{ monthDay: 5, endType: 'afterCount' as const, maxCount: 6 }, 'ทุกเดือน วันที่ 5 · 6 ครั้ง'],
    [{ freq: 'daily' as const, interval: 2 }, 'ทุก 2 วัน · ไม่มีวันสิ้นสุด'],
    [
      { freq: 'weekly' as const, weekdays: ['WE', 'MO'] as const },
      'ทุกสัปดาห์ วันจันทร์ พุธ · ไม่มีวันสิ้นสุด',
    ],
    [
      { freq: 'yearly' as const, endType: 'onDate' as const, endsAt: '2030-01-31' },
      'ทุกปี วันที่ 31 ม.ค. · ถึง 31 ม.ค. 2030',
    ],
  ])('%o', (patch, expected) => {
    expect(describeDraft(draft(patch as Partial<RecurrenceDraft>))).toBe(expected);
  });
});

describe('ใช้กับ engine จริง (@nosion/core)', () => {
  it('DoD: บิลทุกวันที่ 31 ที่สร้างจาก builder → รอบเดือน ก.พ. เป็นวันที่ 28', () => {
    const d = draft();
    const timezone = 'Asia/Bangkok';
    const spec = {
      rrule: buildRrule(d),
      startsAt: resolveDateInput(d.startsAt, timezone),
      timezone,
      end: { type: 'never' as const },
    };
    const dates = nextOccurrences(spec, new Date(spec.startsAt.getTime() - 1), 3).map((x) =>
      toFloating(x, timezone).toISOString().slice(0, 10),
    );
    expect(dates).toEqual(['2027-01-31', '2027-02-28', '2027-03-31']);
  });

  it.each([
    draft({ freq: 'weekly', weekdays: ['MO', 'TH'], interval: 2 }),
    draft({ freq: 'daily', interval: 366 }),
    draft({ freq: 'yearly' }),
  ])('rrule ที่ builder สร้างผ่าน parser ของ engine: %o', (d) => {
    expect(() => parseRecurrenceRule(buildRrule(d))).not.toThrow();
  });
});
