import {
  budgetTone,
  type BillDto,
  type BillsUpcomingDto,
  type CategoryAmountDto,
  type ExpenseCategory,
  type ExpenseForecastDto,
  type ExpensePayload,
  type ExpenseSummaryDto,
  type ExpenseTrendPointDto,
} from '@nosion/contracts';
import { formatInTimeZone, monthBoundsInTimeZone, type MonthBounds } from '@nosion/core';
import { isSpent, type SpendableEntry } from './expense.trackable';

/**
 * ตัวเลขวิเคราะห์ของโมดูลการเงิน — pure function ทั้งหมด (ไม่มี Prisma, ไม่อ่านนาฬิกาเอง)
 * กฎ "ใช้จ่ายจริง" มาจาก isSpent() ตัวเดียวกับ Today / งบประมาณ
 */
export type AnalyticsEntry = SpendableEntry & {
  id: string;
  title: string;
  occurredAt: Date | null;
  createdAt: Date;
  version: number;
};

const payloadOf = (e: SpendableEntry) => e.payload as ExpensePayload;

/** วันที่ของรายการ — ไม่มี occurredAt ใช้วันที่สร้าง (ตรงกับ ExpenseStatsService.rangeWhere) */
export const dateOf = (e: AnalyticsEntry): Date => e.occurredAt ?? e.createdAt;

const isIncome = (e: SpendableEntry) =>
  e.status !== 'cancelled' && !e.deletedAt && payloadOf(e).direction === 'income';

const isUnpaidBill = (e: SpendableEntry) =>
  e.status !== 'cancelled' &&
  e.status !== 'done' &&
  !e.deletedAt &&
  payloadOf(e).isBill &&
  payloadOf(e).direction === 'expense';

/** จำนวนวันตามปฏิทินระหว่าง 'YYYY-MM-DD' สองค่า (ไม่ขึ้นกับ DST เพราะเทียบเป็นวันล้วน) */
export function daysBetween(fromYmd: string, toYmd: string): number {
  const utc = (ymd: string) => Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10));
  return Math.round((utc(toYmd) - utc(fromYmd)) / 86_400_000);
}

function totals(entries: SpendableEntry[]) {
  const spent = entries.filter(isSpent);
  const sum = (list: SpendableEntry[]) => list.reduce((a, e) => a + payloadOf(e).amountMinor, 0);
  return {
    spent,
    expenseMinor: sum(spent),
    incomeMinor: sum(entries.filter(isIncome)),
    fixedMinor: sum(spent.filter((e) => payloadOf(e).costType === 'fixed')),
    variableMinor: sum(spent.filter((e) => payloadOf(e).costType === 'variable')),
  };
}

// ── summary ─────────────────────────────────────────
export function buildSummary(
  entries: SpendableEntry[],
  period: string,
  currency: string,
): ExpenseSummaryDto {
  const t = totals(entries);
  const byCategory = new Map<ExpenseCategory, { amountMinor: number; count: number }>();
  for (const e of t.spent) {
    const p = payloadOf(e);
    const cur = byCategory.get(p.category) ?? { amountMinor: 0, count: 0 };
    byCategory.set(p.category, {
      amountMinor: cur.amountMinor + p.amountMinor,
      count: cur.count + 1,
    });
  }
  const categories: CategoryAmountDto[] = [...byCategory]
    .map(([category, v]) => ({
      category,
      ...v,
      share: t.expenseMinor > 0 ? v.amountMinor / t.expenseMinor : 0,
    }))
    .sort((a, b) => b.amountMinor - a.amountMinor);

  return {
    period,
    currency,
    expenseMinor: t.expenseMinor,
    incomeMinor: t.incomeMinor,
    netMinor: t.incomeMinor - t.expenseMinor,
    fixedMinor: t.fixedMinor,
    variableMinor: t.variableMinor,
    count: t.spent.length,
    byCategory: categories,
  };
}

// ── forecast ────────────────────────────────────────
/**
 * คาดการณ์ยอดสิ้นเดือน (สเปก 7.3, 8.11.3 KPI 2)
 *
 *   projected = variable ถึงวันนี้ × (วันในเดือน ÷ วันที่ผ่านไป)   ← ค่าใช้จ่ายจรโตตามเวลา
 *             + fixed ที่จ่ายแล้ว                                  ← จ่ายครั้งเดียวต่อเดือน ไม่คูณ
 *             + บิลของเดือนนี้ที่ยังไม่จ่าย                           ← รู้อยู่แล้วว่าจะมา
 *
 * ถ้าคูณ fixed ด้วย: จ่ายค่าเช่า 8,500 วันที่ 1 → วันที่ 1 คาดการณ์ได้ 255,000 บาท
 */
export function buildForecast(input: {
  entries: AnalyticsEntry[];
  bounds: MonthBounds;
  now: Date;
  timeZone: string;
  currency: string;
  budgetMinor: number | null;
}): ExpenseForecastDto {
  const { bounds, timeZone } = input;
  const asOf = formatInTimeZone(input.now, timeZone);
  // เดือนที่ผ่านไปแล้วทั้งเดือน = นับครบทุกวัน (คาดการณ์ = ยอดจริง)
  const dayOfMonth = asOf.startsWith(bounds.period)
    ? Number(asOf.slice(8, 10))
    : bounds.daysInMonth;

  const t = totals(input.entries);
  const unpaidBillsMinor = input.entries
    .filter(isUnpaidBill)
    .reduce((a, e) => a + payloadOf(e).amountMinor, 0);
  const projectedMinor =
    Math.round((t.variableMinor * bounds.daysInMonth) / dayOfMonth) +
    t.fixedMinor +
    unpaidBillsMinor;

  // ยอดสะสมรายวัน 1..วันนี้ — วันที่ไม่มีรายการได้ค่าเท่าวันก่อน (เส้นแบน)
  const perDay = new Map<string, number>();
  for (const e of t.spent) {
    const day = formatInTimeZone(dateOf(e as AnalyticsEntry), timeZone);
    perDay.set(day, (perDay.get(day) ?? 0) + payloadOf(e).amountMinor);
  }
  const series: ExpenseForecastDto['series'] = [];
  let running = 0;
  for (let d = 1; d <= dayOfMonth; d++) {
    const date = `${bounds.period}-${String(d).padStart(2, '0')}`;
    running += perDay.get(date) ?? 0;
    series.push({ date, cumulativeMinor: running });
  }

  return {
    period: bounds.period,
    currency: input.currency,
    asOf,
    dayOfMonth,
    daysInMonth: bounds.daysInMonth,
    spentToDateMinor: t.expenseMinor,
    projectedMinor,
    unpaidBillsMinor,
    budgetMinor: input.budgetMinor,
    marginMinor: input.budgetMinor === null ? null : input.budgetMinor - projectedMinor,
    status: budgetTone(projectedMinor, input.budgetMinor),
    series,
  };
}

// ── trends ──────────────────────────────────────────
/** แบ่งรายการลงถังรายเดือนตามโซนผู้ใช้ · เดือนที่ไม่มีรายการได้ศูนย์ (กราฟไม่ขาดช่วง) */
export function buildTrends(
  entries: AnalyticsEntry[],
  months: MonthBounds[],
  timeZone: string,
): ExpenseTrendPointDto[] {
  const buckets = new Map<string, AnalyticsEntry[]>(months.map((m) => [m.period, []]));
  for (const e of entries) {
    buckets.get(monthBoundsInTimeZone(dateOf(e), timeZone).period)?.push(e);
  }
  return months.map((m) => {
    const list = buckets.get(m.period)!;
    const t = totals(list);
    const byCategory: ExpenseTrendPointDto['byCategory'] = {};
    for (const e of t.spent) {
      const p = payloadOf(e);
      byCategory[p.category] = (byCategory[p.category] ?? 0) + p.amountMinor;
    }
    return {
      period: m.period,
      expenseMinor: t.expenseMinor,
      incomeMinor: t.incomeMinor,
      fixedMinor: t.fixedMinor,
      variableMinor: t.variableMinor,
      byCategory,
    };
  });
}

// ── bills ───────────────────────────────────────────
/**
 * entries = บิลของเดือนนี้ (ทุกสถานะยกเว้นยกเลิก) + บิลค้างจ่ายจากเดือนก่อน
 * "ใกล้ครบกำหนด" = ยังไม่จ่าย และครบกำหนดภายใน `days` วัน นับวันนี้เป็นวันที่ 0
 */
export function buildBills(input: {
  entries: AnalyticsEntry[];
  bounds: MonthBounds;
  now: Date;
  timeZone: string;
  currency: string;
  days: number;
}): BillsUpcomingDto {
  const today = formatInTimeZone(input.now, input.timeZone);
  const bills: BillDto[] = input.entries
    .filter((e) => payloadOf(e).isBill && e.status !== 'cancelled' && !e.deletedAt)
    .map((e) => {
      const p = payloadOf(e);
      const dueDate = formatInTimeZone(dateOf(e), input.timeZone);
      const paid = e.status === 'done';
      return {
        id: e.id,
        title: e.title,
        amountMinor: p.amountMinor,
        currency: p.currency,
        dueDate,
        paid,
        paymentMethod: p.paymentMethod,
        daysUntilDue: paid ? null : daysBetween(today, dueDate),
        version: e.version,
      };
    })
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.title.localeCompare(b.title));

  const inMonth = (b: BillDto) => b.dueDate.startsWith(input.bounds.period);
  return {
    currency: input.currency,
    fixedMonthlyMinor: bills.filter(inMonth).reduce((a, b) => a + b.amountMinor, 0),
    bills,
    dueSoonCount: bills.filter(
      (b) => b.daysUntilDue !== null && b.daysUntilDue >= 0 && b.daysUntilDue < input.days,
    ).length,
    overdueCount: bills.filter((b) => b.daysUntilDue !== null && b.daysUntilDue < 0).length,
  };
}
