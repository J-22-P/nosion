import { describe, expect, it } from 'vitest';
import { formatClock, formatDueDate, formatDuration, isOverdueDate } from './format';

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
    expect(isOverdueDate('2026-09-01T00:00:00Z', 'done', true, now)).toBe(false);
    expect(isOverdueDate('2026-09-01T00:00:00Z', 'pending', true, now)).toBe(true);
  });

  it('งานทั้งวันที่กำหนดวันนี้ยังไม่เลย ไม่ว่ากี่โมง (บั๊กเดิม: เลยตั้งแต่ 07:00)', () => {
    const dueToday = '2026-09-17T17:00:00Z'; // 18 ก.ย. 00:00 เวลาไทย
    expect(isOverdueDate(dueToday, 'pending', true, now)).toBe(false);
    expect(isOverdueDate(dueToday, 'pending', true, new Date('2026-09-18T23:59:00+07:00'))).toBe(
      false,
    );
    expect(isOverdueDate(dueToday, 'pending', true, new Date('2026-09-19T00:00:00+07:00'))).toBe(
      true,
    );
  });

  it('งานมีเวลา: เลยเมื่อเลยเวลา', () => {
    expect(isOverdueDate('2026-09-18T09:00:00+07:00', 'pending', false, now)).toBe(true);
    expect(isOverdueDate('2026-09-18T11:00:00+07:00', 'pending', false, now)).toBe(false);
  });

  it('ผลเหมือนกันไม่ว่าเครื่องที่รันจะอยู่โซนไหน (Mac = ไทย, CI = UTC)', () => {
    // 18 ก.ย. 06:00 เวลาไทย = 17 ก.ย. 23:00 UTC — ถ้าใช้โซนของเครื่อง CI จะว่า "เมื่อวาน"
    expect(formatDueDate('2026-09-17T23:00:00Z', now)).toBe('วันนี้');
  });
});

describe('formatDuration', () => {
  it('ชั่วโมง + นาที แบบสั้น', () => {
    expect(formatDuration(9900)).toBe('2h 45m');
    expect(formatDuration(2700)).toBe('45m');
    expect(formatDuration(7200)).toBe('2h');
    expect(formatDuration(59)).toBe('0m');
    expect(formatDuration(-5)).toBe('0m');
  });
});

describe('formatClock', () => {
  it('mm:ss และ h:mm:ss', () => {
    expect(formatClock(754)).toBe('12:34');
    expect(formatClock(3723)).toBe('1:02:03');
    expect(formatClock(0)).toBe('0:00');
  });
});
