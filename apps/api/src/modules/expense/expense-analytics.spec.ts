import { expensePayloadSchema, type ExpensePayload } from '@nosion/contracts';
import { periodBounds } from '@nosion/core';
import { describe, expect, it } from 'vitest';
import {
  buildBills,
  buildForecast,
  buildSummary,
  buildTrends,
  daysBetween,
  type AnalyticsEntry,
} from './expense-analytics';

const TZ = 'Asia/Bangkok';
const SEP = periodBounds('2026-09', TZ);
/** 18 ก.ย. 2026 10:00 เวลาไทย */
const NOW = new Date('2026-09-18T03:00:00Z');

let seq = 0;
const e = (
  p: Partial<ExpensePayload> & { amountMinor: number },
  over: Partial<AnalyticsEntry> = {},
): AnalyticsEntry => ({
  id: `e${++seq}`,
  title: `รายการ ${seq}`,
  status: 'done',
  deletedAt: null,
  payload: expensePayloadSchema.parse(p),
  occurredAt: new Date('2026-09-10T03:00:00Z'),
  createdAt: new Date('2026-09-10T03:00:00Z'),
  version: 1,
  ...over,
});
/** 'YYYY-MM-DD' 10:00 เวลาไทย */
const on = (ymd: string) => new Date(`${ymd}T03:00:00Z`);

describe('daysBetween', () => {
  it('นับเป็นวันปฏิทิน ข้ามเดือน/ปีได้ ติดลบได้', () => {
    expect(daysBetween('2026-09-18', '2026-09-18')).toBe(0);
    expect(daysBetween('2026-09-18', '2026-10-05')).toBe(17);
    expect(daysBetween('2026-09-18', '2026-09-15')).toBe(-3);
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1);
  });
});

describe('buildSummary', () => {
  it('แยก fixed/variable, รายรับ, net และสัดส่วนหมวด · บิลค้างจ่ายไม่นับ', () => {
    const s = buildSummary(
      [
        e({ amountMinor: 30000, category: 'food' }),
        e({ amountMinor: 10000, category: 'transport' }),
        e({ amountMinor: 850000, category: 'housing', isBill: true, costType: 'fixed' }),
        e(
          { amountMinor: 79900, category: 'utilities', isBill: true, costType: 'fixed' },
          { status: 'pending' },
        ),
        e({ amountMinor: 4500000, direction: 'income' }),
      ],
      '2026-09',
      'THB',
    );
    expect(s).toMatchObject({
      expenseMinor: 890000,
      incomeMinor: 4500000,
      netMinor: 3610000,
      fixedMinor: 850000,
      variableMinor: 40000,
      count: 3,
    });
    expect(s.byCategory.map((c) => c.category)).toEqual(['housing', 'food', 'transport']);
    expect(s.byCategory.reduce((a, c) => a + c.share, 0)).toBeCloseTo(1, 10);
  });

  it('ไม่มีรายจ่าย → share 0 ไม่หารด้วยศูนย์', () => {
    expect(
      buildSummary([e({ amountMinor: 100, direction: 'income' })], '2026-09', 'THB').byCategory,
    ).toEqual([]);
  });
});

describe('buildForecast', () => {
  const forecast = (entries: AnalyticsEntry[], budgetMinor: number | null = 1500000, now = NOW) =>
    buildForecast({ entries, bounds: SEP, now, timeZone: TZ, currency: 'THB', budgetMinor });

  it('variable โตตามเวลา · fixed ที่จ่ายแล้วไม่คูณ · บิลค้างจ่ายบวกเพิ่ม', () => {
    // วันที่ 18 จาก 30 วัน: variable 5,400 → 9,000 · fixed 3,000 · บิลค้าง 799
    const f = forecast([
      e({ amountMinor: 540000 }),
      e({ amountMinor: 300000, costType: 'fixed', isBill: true }),
      e(
        { amountMinor: 79900, isBill: true, costType: 'fixed' },
        { status: 'pending', occurredAt: on('2026-09-25') },
      ),
    ]);
    expect(f).toMatchObject({
      dayOfMonth: 18,
      daysInMonth: 30,
      spentToDateMinor: 840000,
      unpaidBillsMinor: 79900,
    });
    expect(f.projectedMinor).toBe(900000 + 300000 + 79900);
    expect(f.marginMinor).toBe(1500000 - 1279900);
    expect(f.status).toBe('warning'); // 85.3%
  });

  it('ค่าเช่าก้อนใหญ่วันที่ 1 ไม่ทำให้คาดการณ์ระเบิด (ไม่คูณ fixed)', () => {
    const f = forecast(
      [
        e(
          { amountMinor: 850000, costType: 'fixed', isBill: true },
          { occurredAt: on('2026-09-01') },
        ),
      ],
      null,
      on('2026-09-01'),
    );
    expect(f.projectedMinor).toBe(850000);
    expect(f.status).toBe('safe'); // ไม่มีงบ
    expect(f.marginMinor).toBeNull();
  });

  it('series สะสมรายวันตามโซนเวลาไทย · วันที่ไม่มีรายการเป็นเส้นแบน', () => {
    const f = forecast([
      // 31 ส.ค. 18:00Z = 1 ก.ย. 01:00 เวลาไทย → วันที่ 1
      e({ amountMinor: 6000 }, { occurredAt: new Date('2026-08-31T18:00:00Z') }),
      e({ amountMinor: 4000 }, { occurredAt: on('2026-09-03') }),
    ]);
    expect(f.series).toHaveLength(18);
    expect(f.series.slice(0, 4).map((p) => p.cumulativeMinor)).toEqual([6000, 6000, 10000, 10000]);
    expect(f.series.at(-1)).toEqual({ date: '2026-09-18', cumulativeMinor: 10000 });
  });

  it('เกินงบ → over และ margin ติดลบ', () => {
    const f = forecast([e({ amountMinor: 1000000 })]);
    expect(f.status).toBe('over');
    expect(f.marginMinor).toBeLessThan(0);
  });
});

describe('buildTrends', () => {
  it('แบ่งถังตามเดือนในโซนเวลาผู้ใช้ · เดือนว่างได้ศูนย์', () => {
    const months = [-2, -1, 0].map((s) => periodBounds('2026-09', TZ, s));
    const points = buildTrends(
      [
        e({ amountMinor: 1000, category: 'food' }, { occurredAt: on('2026-07-15') }),
        // 31 ส.ค. 18:00Z = 1 ก.ย. เวลาไทย → เดือนกันยายน ไม่ใช่สิงหาคม
        e(
          { amountMinor: 2000, category: 'food' },
          { occurredAt: new Date('2026-08-31T18:00:00Z') },
        ),
        e({ amountMinor: 500, direction: 'income' }, { occurredAt: on('2026-09-02') }),
      ],
      months,
      TZ,
    );
    expect(points.map((p) => [p.period, p.expenseMinor, p.incomeMinor])).toEqual([
      ['2026-07', 1000, 0],
      ['2026-08', 0, 0],
      ['2026-09', 2000, 500],
    ]);
    expect(points[2]!.byCategory).toEqual({ food: 2000 });
  });
});

describe('buildBills', () => {
  const bills = (entries: AnalyticsEntry[]) =>
    buildBills({ entries, bounds: SEP, now: NOW, timeZone: TZ, currency: 'THB', days: 7 });

  it('เรียงตามวันครบกำหนด · นับใกล้ครบ (0–6 วัน) และเลยกำหนด · รวมบิลทั้งเดือน', () => {
    const r = bills([
      e(
        { amountMinor: 79900, isBill: true },
        { title: 'AIS Fibre', status: 'pending', occurredAt: on('2026-09-20') },
      ),
      e(
        { amountMinor: 125000, isBill: true },
        { title: 'AWS', status: 'pending', occurredAt: on('2026-09-24') },
      ),
      e(
        { amountMinor: 100000, isBill: true },
        { title: 'ค่าน้ำ', status: 'pending', occurredAt: on('2026-09-25') },
      ),
      e(
        { amountMinor: 35000, isBill: true },
        { title: 'Copilot', status: 'done', occurredAt: on('2026-09-05') },
      ),
      // ค้างจากเดือนก่อน — เลยกำหนด แต่ไม่นับใน "ต่อเดือน" ของเดือนนี้
      e(
        { amountMinor: 50000, isBill: true },
        { title: 'ค่าโทร ส.ค.', status: 'pending', occurredAt: on('2026-08-28') },
      ),
      e({ amountMinor: 6500 }, { title: 'ไม่ใช่บิล' }),
    ]);
    expect(r.bills.map((b) => [b.title, b.daysUntilDue])).toEqual([
      ['ค่าโทร ส.ค.', -21],
      ['Copilot', null],
      ['AIS Fibre', 2],
      ['AWS', 6],
      ['ค่าน้ำ', 7],
    ]);
    expect(r).toMatchObject({
      fixedMonthlyMinor: 79900 + 125000 + 100000 + 35000,
      dueSoonCount: 2,
      overdueCount: 1,
    });
  });
});
