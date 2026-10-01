import { z } from 'zod';
import { expenseCategorySchema, type ExpenseCategory } from './payloads';

/**
 * สัญญาของโมดูลการเงิน (สเปก 7.3 · 8.11.3)
 * /budgets (CRUD) · /budgets/status · /expenses/summary|forecast|trends|bills/upcoming
 */

// ── กฎสีงบประมาณ (สเปก 8.7.5) — API กับ web ใช้ฟังก์ชันเดียวกัน ──
export const BUDGET_WARNING_RATIO = 0.85;

/** safe < 85% ≤ warning < 100% ≤ over · ไม่มีงบ (limit ≤ 0) = safe */
export type BudgetTone = 'safe' | 'warning' | 'over';

export function budgetTone(spentMinor: number, limitMinor: number | null): BudgetTone {
  if (limitMinor === null || limitMinor <= 0) return 'safe';
  const ratio = spentMinor / limitMinor;
  if (ratio >= 1) return 'over';
  if (ratio >= BUDGET_WARNING_RATIO) return 'warning';
  return 'safe';
}

// ── Budget CRUD ───────────────────────────────────
export const createBudgetSchema = z.object({
  /** null = งบรวมทุกหมวด (มีได้ 1 ก้อนต่อผู้ใช้) */
  category: expenseCategorySchema.nullable().default(null),
  amountMinor: z.number().int().positive(),
  /** % ที่จะแจ้งเตือน (Phase 4 budget-alert) */
  alertThreshold: z.number().int().min(1).max(100).default(80),
});
export type CreateBudgetInput = z.infer<typeof createBudgetSchema>;

export const updateBudgetSchema = z
  .object({
    amountMinor: z.number().int().positive(),
    alertThreshold: z.number().int().min(1).max(100),
    isActive: z.boolean(),
  })
  .partial();
export type UpdateBudgetInput = z.infer<typeof updateBudgetSchema>;

export interface BudgetDto {
  id: string;
  category: ExpenseCategory | null;
  amountMinor: number;
  currency: string;
  period: 'monthly';
  alertThreshold: number;
  isActive: boolean;
}

// ── /budgets/status ───────────────────────────────
export const periodQuerySchema = z.object({
  /** 'YYYY-MM' · ไม่ส่ง = เดือนปัจจุบันตามโซนเวลาผู้ใช้ */
  period: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'ต้องเป็น YYYY-MM')
    .optional(),
});

export interface BudgetLineDto {
  spentMinor: number;
  /** null = ไม่ได้ตั้งงบ */
  budgetMinor: number | null;
  /** spent / budget (ไม่ตัดที่ 1 — 1.12 = เกิน 12%) · null เมื่อไม่มีงบ */
  ratio: number | null;
  tone: BudgetTone;
}

export interface BudgetStatusDto {
  /** 'YYYY-MM' */
  period: string;
  /** 'YYYY-MM-DD' วันแรก / วันสุดท้าย ตามโซนผู้ใช้ — ป้าย "เริ่ม 1 ก.ย. / สิ้นสุด 30 ก.ย." */
  firstDay: string;
  lastDay: string;
  currency: string;
  /**
   * งบรวม: ใช้ก้อน category=null ถ้ามี · ไม่มีแต่ตั้งรายหมวดไว้ = ผลรวมของงบรายหมวด
   * spentMinor = รายจ่ายทุกหมวด (รวมหมวดที่ไม่ได้ตั้งงบ)
   */
  total: BudgetLineDto & { budgetSource: 'total' | 'sum-of-categories' | 'none' };
  /** ทุกหมวดที่มีงบ หรือมีรายจ่าย — เรียงตามยอดใช้มากไปน้อย */
  categories: (BudgetLineDto & { category: ExpenseCategory })[];
}

// ── /expenses/summary ─────────────────────────────
export interface CategoryAmountDto {
  category: ExpenseCategory;
  amountMinor: number;
  count: number;
  /** สัดส่วนของรายจ่ายทั้งหมด 0..1 (donut) */
  share: number;
}

export interface ExpenseSummaryDto {
  period: string;
  currency: string;
  /** รายจ่ายที่ "ใช้จริง" (กฎ isSpent: ไม่รวมบิลค้างจ่าย/ยกเลิก) */
  expenseMinor: number;
  incomeMinor: number;
  /** income − expense */
  netMinor: number;
  fixedMinor: number;
  variableMinor: number;
  /** จำนวนรายการรายจ่ายที่นับ */
  count: number;
  /** มากไปน้อย */
  byCategory: CategoryAmountDto[];
}

// ── /expenses/forecast ────────────────────────────
export interface ExpenseForecastDto {
  period: string;
  currency: string;
  /** วันนี้ตามโซนผู้ใช้ 'YYYY-MM-DD' */
  asOf: string;
  dayOfMonth: number;
  daysInMonth: number;
  spentToDateMinor: number;
  /** variable ถึงวันนี้ ÷ วันที่ผ่านไป × จำนวนวันในเดือน + fixed ที่จ่ายแล้ว + บิลค้างจ่ายของเดือนนี้ */
  projectedMinor: number;
  /** บิลของเดือนนี้ที่ยังไม่จ่าย (รวมในคาดการณ์แล้ว) */
  unpaidBillsMinor: number;
  budgetMinor: number | null;
  /** budget − projected (บวก = ต่ำกว่าเป้า) · null เมื่อไม่มีงบ */
  marginMinor: number | null;
  status: BudgetTone;
  /** ยอดใช้สะสมรายวันตั้งแต่วันที่ 1 ถึงวันนี้ — sparkline */
  series: { date: string; cumulativeMinor: number }[];
}

// ── /expenses/trends ──────────────────────────────
export const trendsQuerySchema = z.object({
  months: z.coerce.number().int().min(1).max(12).default(6),
});

export interface ExpenseTrendPointDto {
  period: string;
  expenseMinor: number;
  incomeMinor: number;
  fixedMinor: number;
  variableMinor: number;
  byCategory: Partial<Record<ExpenseCategory, number>>;
}

export interface ExpenseTrendsDto {
  currency: string;
  /** เก่า → ใหม่ · เดือนปัจจุบันอยู่ท้ายสุด (ยังไม่จบเดือน) */
  points: ExpenseTrendPointDto[];
}

// ── /expenses/bills/upcoming ──────────────────────
export const billsQuerySchema = z.object({
  /** หน้าต่าง "ใกล้ครบกำหนด" (วัน) */
  days: z.coerce.number().int().min(1).max(31).default(7),
});

export interface BillDto {
  id: string;
  title: string;
  amountMinor: number;
  currency: string;
  /** 'YYYY-MM-DD' ตามโซนผู้ใช้ */
  dueDate: string;
  paid: boolean;
  paymentMethod: 'cash' | 'card' | 'transfer' | 'ewallet' | 'other';
  /** ติดลบ = เลยกำหนดมาแล้ว · null เมื่อจ่ายแล้ว */
  daysUntilDue: number | null;
  version: number;
}

export interface BillsUpcomingDto {
  currency: string;
  /** ผลรวมบิลทั้งหมดของเดือนนี้ (จ่ายแล้ว + ยังไม่จ่าย) — "฿3,450 / เดือน" */
  fixedMonthlyMinor: number;
  /** บิลของเดือนนี้ + บิลค้างจ่ายจากเดือนก่อน เรียงตามวันครบกำหนด */
  bills: BillDto[];
  /** ยังไม่จ่าย และครบกำหนดภายใน `days` วัน (รวมวันนี้) */
  dueSoonCount: number;
  overdueCount: number;
}
