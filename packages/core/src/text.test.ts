import { describe, expect, it } from 'vitest';
import { formatMoney } from './money';
import { text } from './text';
import { greetingFor } from './time';

describe('text — ข้อความของเซิร์ฟเวอร์สองภาษา', () => {
  it('แทนค่า {ชื่อ} · ภาษาอังกฤษเลือกพหูพจน์เอง', () => {
    expect(text('th', 'task.today.headline', { count: 3 })).toBe('งานวันนี้ 3 ชิ้น');
    expect(text('en', 'task.today.headline', { count: 1 })).toBe('1 task today');
    expect(text('en', 'task.today.headline', { count: 3 })).toBe('3 tasks today');
    expect(text('en', 'expense.due.overdue', { days: 2 })).toBe('2 days overdue');
  });

  it('ไม่มีค่าให้แทน → คง {ชื่อ} ไว้ (เห็นชัดตอนลืมส่ง ไม่ใช่ undefined)', () => {
    expect(text('th', 'habit.today.headline', { done: 1 })).toBe('ทำแล้ว 1 จาก {total}');
  });

  it('คำทักทายตามภาษา · ไม่มีชื่อก็ไม่ทิ้งจุลภาค/ช่องว่างค้าง', () => {
    const afternoon = new Date('2026-10-17T07:00:00Z'); // 14:00 กรุงเทพ
    expect(greetingFor(afternoon, 'Asia/Bangkok', 'Jay')).toBe('สวัสดีตอนบ่าย Jay');
    expect(greetingFor(afternoon, 'Asia/Bangkok', 'Jay', 'en')).toBe('Good afternoon, Jay');
    expect(greetingFor(afternoon, 'Asia/Bangkok', '', 'en')).toBe('Good afternoon');
  });

  it('เงินเป็น ฿ ทั้งสองภาษา (en-US ค่าเริ่มต้นจะเขียน THB)', () => {
    expect(formatMoney(123450, 'THB', { locale: 'en-US' })).toBe('฿1,234.50');
    expect(formatMoney(123450, 'THB')).toBe('฿1,234.50');
  });
});
