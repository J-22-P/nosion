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
