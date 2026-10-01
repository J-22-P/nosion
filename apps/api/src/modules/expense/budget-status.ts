import {
  budgetTone,
  type BudgetLineDto,
  type BudgetStatusDto,
  type ExpenseCategory,
  type ExpensePayload,
} from '@nosion/contracts';
import { formatInTimeZone, type MonthBounds } from '@nosion/core';
import { isSpent, type SpendableEntry } from './expense.trackable';

/** ยอดใช้จริงแยกหมวด — ใช้กฎ isSpent() ตัวเดียวกับ Today/Weekly */
export function spentByCategory(entries: SpendableEntry[]): Map<ExpenseCategory, number> {
  const out = new Map<ExpenseCategory, number>();
  for (const e of entries) {
    if (!isSpent(e)) continue;
    const p = e.payload as ExpensePayload;
    out.set(p.category, (out.get(p.category) ?? 0) + p.amountMinor);
  }
  return out;
}

function line(spentMinor: number, budgetMinor: number | null): BudgetLineDto {
  return {
    spentMinor,
    budgetMinor,
    ratio: budgetMinor && budgetMinor > 0 ? spentMinor / budgetMinor : null,
    tone: budgetTone(spentMinor, budgetMinor),
  };
}

/**
 * งบรวมของเดือน — ก้อน category=null ถ้ามี · ไม่มีแต่ตั้งรายหมวดไว้ = ผลรวมรายหมวด
 * ใช้ทั้ง /budgets/status และ /expenses/forecast (กฎเดียว ตัวเลขสองการ์ดตรงกัน)
 */
export function resolveTotalBudget(
  budgets: { category: ExpenseCategory | null; amountMinor: number }[],
): { budgetMinor: number | null; budgetSource: 'total' | 'sum-of-categories' | 'none' } {
  const explicit = budgets.find((b) => b.category === null);
  if (explicit) return { budgetMinor: explicit.amountMinor, budgetSource: 'total' };
  const perCategory = budgets.filter((b) => b.category !== null);
  if (perCategory.length === 0) return { budgetMinor: null, budgetSource: 'none' };
  return {
    budgetMinor: perCategory.reduce((a, b) => a + b.amountMinor, 0),
    budgetSource: 'sum-of-categories',
  };
}

/**
 * ประกอบ /budgets/status จากข้อมูลดิบ — pure function ทดสอบได้โดยไม่มีฐานข้อมูล
 * budgets = เฉพาะที่ isActive
 */
export function buildBudgetStatus(input: {
  bounds: MonthBounds;
  timeZone: string;
  currency: string;
  budgets: { category: ExpenseCategory | null; amountMinor: number }[];
  spent: Map<ExpenseCategory, number>;
}): BudgetStatusDto {
  const { bounds, spent } = input;
  const byCategory = new Map(
    input.budgets
      .filter((b): b is { category: ExpenseCategory; amountMinor: number } => b.category !== null)
      .map((b) => [b.category, b.amountMinor]),
  );
  const { budgetMinor: totalBudget, budgetSource } = resolveTotalBudget(input.budgets);
  const totalSpent = [...spent.values()].reduce((a, b) => a + b, 0);

  const categories = [...new Set<ExpenseCategory>([...byCategory.keys(), ...spent.keys()])]
    .map((category) => ({
      category,
      ...line(spent.get(category) ?? 0, byCategory.get(category) ?? null),
    }))
    // ใช้มากไปน้อย · เท่ากันให้หมวดที่มีงบขึ้นก่อน (หมวดที่ตั้งงบแต่ยังไม่ใช้ยังต้องเห็น)
    .sort((a, b) => b.spentMinor - a.spentMinor || (b.budgetMinor ?? 0) - (a.budgetMinor ?? 0));

  return {
    period: bounds.period,
    firstDay: formatInTimeZone(bounds.start, input.timeZone),
    // end เป็น exclusive → วันสุดท้าย = 1 ms ก่อนต้นเดือนถัดไป
    lastDay: formatInTimeZone(new Date(bounds.end.getTime() - 1), input.timeZone),
    currency: input.currency,
    total: { ...line(totalSpent, totalBudget), budgetSource },
    categories,
  };
}
