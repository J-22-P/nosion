import type { ExpensePayload } from '@nosion/contracts';
import type { Entry } from '@nosion/core';

/**
 * กฎ "ใช้จ่ายจริง" — ที่เดียวของทั้งระบบ
 * Today, Weekly, งบประมาณ, summary, forecast เรียกฟังก์ชันนี้ทั้งหมด ตัวเลขจึงตรงกันเสมอ
 */

/** ฟิลด์ที่กฎ "ใช้จ่ายจริง" ต้องใช้ — query ที่ select แค่นี้ก็เรียกได้ */
export type SpendableEntry = Pick<Entry, 'status' | 'deletedAt' | 'payload'>;

/** รายการที่นับเป็น "ใช้จ่ายจริง" — ยกเลิกแล้วไม่นับ · บิลที่ยังไม่จ่ายไม่นับ */
export function isSpent(entry: SpendableEntry): boolean {
  if (entry.status === 'cancelled' || entry.deletedAt) return false;
  const p = entry.payload as ExpensePayload;
  if (p.direction !== 'expense') return false;
  return !p.isBill || entry.status === 'done';
}

/** ผลรวมรายจ่าย (หน่วยย่อย) ของรายการที่ใช้จ่ายจริง */
export function sumSpent(entries: SpendableEntry[]): number {
  return entries
    .filter(isSpent)
    .reduce((sum, e) => sum + (e.payload as ExpensePayload).amountMinor, 0);
}
