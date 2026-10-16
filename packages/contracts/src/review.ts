import { z } from 'zod';
import type { ModuleKey } from './enums';

/**
 * GET /review/weekly (สเปก 7.3 "Cross-module" · Phase 6) — สรุปรายสัปดาห์จาก `summarizeWeek()` ของทุกโมดูลที่เปิด
 * `?week=2026-W42` (ISO 8601) · ไม่ส่ง = สัปดาห์นี้ตามโซนผู้ใช้
 */
export const reviewQuerySchema = z.object({
  week: z
    .string()
    .regex(/^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/, 'ต้องเป็น YYYY-Www เช่น 2026-W42')
    .optional(),
});
export type ReviewQuery = z.infer<typeof reviewQuerySchema>;

export interface WeeklySectionDto {
  module: ModuleKey;
  title: string;
  order: number;
  stats: { label: string; value: string; deltaPct?: number }[];
  highlights: string[];
}

export interface WeeklyReviewDto {
  /** '2026-W42' */
  week: string;
  /** วันจันทร์ – อาทิตย์ ('YYYY-MM-DD' ตามโซนผู้ใช้) */
  from: string;
  to: string;
  timezone: string;
  /** สัปดาห์ก่อน/ถัดไป — ปุ่ม ‹ › ไม่ต้องคำนวณสัปดาห์ ISO เอง */
  previousWeek: string;
  nextWeek: string;
  sections: WeeklySectionDto[];
  /** โมดูลที่สรุปไม่สำเร็จ — ส่วนอื่นยังแสดงได้ */
  failedModules: ModuleKey[];
}
