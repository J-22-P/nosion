import { expensePayloadSchema, type ExpensePayload } from '@nosion/contracts';
import { periodBounds } from '@nosion/core';
import { describe, expect, it } from 'vitest';
import { buildBudgetStatus, spentByCategory } from './budget-status';
import type { SpendableEntry } from './expense.trackable';

const TZ = 'Asia/Bangkok';
const bounds = periodBounds('2026-09', TZ);

const e = (
  p: Partial<ExpensePayload> & { amountMinor: number },
  status: SpendableEntry['status'] = 'done',
): SpendableEntry => ({ status, deletedAt: null, payload: expensePayloadSchema.parse(p) });

const build = (
  budgets: { category: ExpensePayload['category'] | null; amountMinor: number }[],
  entries: SpendableEntry[],
) =>
  buildBudgetStatus({
    bounds,
    timeZone: TZ,
    currency: 'THB',
    budgets,
    spent: spentByCategory(entries),
  });

describe('buildBudgetStatus', () => {
  it('ตัวอย่าง mockup: ฿8,420 / ฿15,000 · หมวดอาหาร 87% = เตือน', () => {
    const s = build(
      [
        { category: null, amountMinor: 1500000 },
        { category: 'food', amountMinor: 500000 },
      ],
      [
        e({ amountMinor: 435000, category: 'food' }),
        e({ amountMinor: 407000, category: 'housing' }),
      ],
    );
    expect(s.total).toMatchObject({
      spentMinor: 842000,
      budgetMinor: 1500000,
      tone: 'safe',
      budgetSource: 'total',
    });
    expect(s.total.ratio).toBeCloseTo(0.5613, 3);
    expect(s.categories[0]).toMatchObject({ category: 'food', ratio: 0.87, tone: 'warning' });
    // หมวดที่ใช้แต่ไม่ได้ตั้งงบ ยังแสดง (budget null, ratio null)
    expect(s.categories[1]).toMatchObject({
      category: 'housing',
      budgetMinor: null,
      ratio: null,
      tone: 'safe',
    });
  });

  it('ป้ายวันที่: 1 ก.ย. ถึง 30 ก.ย. ตามโซนผู้ใช้', () => {
    const s = build([], []);
    expect([s.period, s.firstDay, s.lastDay]).toEqual(['2026-09', '2026-09-01', '2026-09-30']);
  });

  it('ไม่มีงบรวม แต่มีงบรายหมวด → งบรวม = ผลรวมรายหมวด', () => {
    const s = build(
      [
        { category: 'food', amountMinor: 500000 },
        { category: 'transport', amountMinor: 200000 },
      ],
      [],
    );
    expect(s.total).toMatchObject({ budgetMinor: 700000, budgetSource: 'sum-of-categories' });
  });

  it('ไม่มีงบเลย → budget null, ratio null, safe', () => {
    const s = build([], [e({ amountMinor: 6500 })]);
    expect(s.total).toMatchObject({
      spentMinor: 6500,
      budgetMinor: null,
      ratio: null,
      budgetSource: 'none',
    });
  });

  it('หมวดที่ตั้งงบแต่ยังไม่ใช้ ยังแสดงด้วย spent 0', () => {
    const s = build([{ category: 'health', amountMinor: 100000 }], []);
    expect(s.categories).toEqual([
      { category: 'health', spentMinor: 0, budgetMinor: 100000, ratio: 0, tone: 'safe' },
    ]);
  });

  it('รายรับ และบิลที่ยังไม่จ่าย ไม่กินงบ', () => {
    const s = build(
      [{ category: null, amountMinor: 100000 }],
      [
        e({ amountMinor: 4500000, direction: 'income' }),
        e({ amountMinor: 79900, category: 'utilities', isBill: true }, 'pending'),
      ],
    );
    expect(s.total.spentMinor).toBe(0);
  });

  it('เกินงบ: ratio ไม่ถูกตัดที่ 1', () => {
    const s = build([{ category: null, amountMinor: 100000 }], [e({ amountMinor: 112000 })]);
    expect(s.total).toMatchObject({ ratio: 1.12, tone: 'over' });
  });
});
