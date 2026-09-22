import { describe, expect, it } from 'vitest';
import { formatDueDate, isOverdueDate } from './format';

const now = new Date('2026-09-18T10:00:00+07:00');

describe('formatDueDate', () => {
  it('แสดงคำที่คนอ่านเข้าใจทันทีสำหรับวันใกล้ ๆ', () => {
    expect(formatDueDate('2026-09-18T03:00:00Z', now)).toBe('วันนี้');
    expect(formatDueDate('2026-09-19T03:00:00Z', now)).toBe('พรุ่งนี้');
    expect(formatDueDate('2026-09-17T03:00:00Z', now)).toBe('เมื่อวาน');
  });

  it('เลยกำหนดหลายวัน → บอกจำนวนวันที่เลยมา', () => {
    expect(formatDueDate('2026-09-13T03:00:00Z', now)).toBe('เลยมา 5 วัน');
  });

  it('ไม่มีกำหนด → null (ไม่ใช่ "Invalid Date")', () => {
    expect(formatDueDate(null, now)).toBeNull();
  });
});

describe('isOverdueDate', () => {
  it('งานที่เสร็จแล้วไม่นับว่าเลยกำหนด แม้วันที่จะผ่านไปแล้ว', () => {
    expect(isOverdueDate('2026-09-01T00:00:00Z', 'done', now)).toBe(false);
    expect(isOverdueDate('2026-09-01T00:00:00Z', 'pending', now)).toBe(true);
  });
});
