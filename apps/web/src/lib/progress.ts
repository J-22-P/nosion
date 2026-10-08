import { budgetTone } from '@nosion/contracts';

export type ProgressTone = 'default' | 'warning' | 'danger';

/** เกณฑ์สีของงบ (สเปก 8.7.5) อยู่ที่ contracts ที่เดียว — API ตอบ `tone` ด้วยกฎเดียวกัน */
export { BUDGET_WARNING_RATIO } from '@nosion/contracts';

/** สัดส่วน 0..1 ที่ปลอดภัยจาก max = 0, ค่าติดลบ และ NaN */
export function progressRatio(value: number, max: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return 0;
  return Math.min(Math.max(value / max, 0), 1);
}

/**
 * สีของเนื้อ progress — ใช้เกณฑ์งบเฉพาะเมื่อ `budget` เท่านั้น
 * (progress ของ subtask/focus ยิ่งเต็มยิ่งดี ไม่ควรแดง)
 *
 * ตาม mockup แท่งเป็นสีเดียว (ดำ/ขาว) — แดงเฉพาะ "เกินงบ" · "ใกล้เกิน" (≥85%) บอกด้วย ToneBadge ข้างแท่ง
 * (ต่างจากสเปก 8.7.5 ที่ให้แท่งเป็นสีเตือน — ADR-009)
 */
export function progressTone(value: number, max: number, budget: boolean): ProgressTone {
  if (!budget) return 'default';
  return budgetTone(value, max) === 'over' ? 'danger' : 'default';
}
