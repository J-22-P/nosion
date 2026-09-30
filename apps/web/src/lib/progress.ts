export type ProgressTone = 'default' | 'warning' | 'danger';

/** เกณฑ์สีของงบ (สเปก 8.7.5): ≥ 85% เตือน · ≥ 100% เกิน */
export const BUDGET_WARNING_RATIO = 0.85;

/** สัดส่วน 0..1 ที่ปลอดภัยจาก max = 0, ค่าติดลบ และ NaN */
export function progressRatio(value: number, max: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return 0;
  return Math.min(Math.max(value / max, 0), 1);
}

/**
 * สีของเนื้อ progress — ใช้เกณฑ์งบเฉพาะเมื่อ `budget` เท่านั้น
 * (progress ของ subtask/focus ยิ่งเต็มยิ่งดี ไม่ควรแดง)
 */
export function progressTone(value: number, max: number, budget: boolean): ProgressTone {
  if (!budget || max <= 0) return 'default';
  const raw = value / max;
  if (raw >= 1) return 'danger';
  if (raw >= BUDGET_WARNING_RATIO) return 'warning';
  return 'default';
}
