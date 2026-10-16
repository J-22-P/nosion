import { describe, expect, it } from 'vitest';
import { isoWeekOf, mondayOfIsoWeek, shiftWeek } from './iso-week';

describe('iso-week', () => {
  it('วันที่ → สัปดาห์ ISO รวมกรณีข้ามปี', () => {
    expect(isoWeekOf('2026-10-16')).toBe('2026-W42');
    expect(isoWeekOf('2026-12-31')).toBe('2026-W53');
    expect(isoWeekOf('2027-01-01')).toBe('2026-W53');
    expect(isoWeekOf('2027-01-04')).toBe('2027-W01');
    expect(isoWeekOf('2024-12-30')).toBe('2025-W01'); // ปลายปีที่เป็นของสัปดาห์แรกปีหน้า
  });

  it('สัปดาห์ → วันจันทร์ และกลับมาได้ค่าเดิม', () => {
    expect(mondayOfIsoWeek('2026-W42')).toBe('2026-10-12');
    expect(mondayOfIsoWeek('2026-W53')).toBe('2026-12-28');
    expect(mondayOfIsoWeek('2025-W01')).toBe('2024-12-30');
    for (const w of ['2026-W01', '2026-W26', '2026-W53'])
      expect(isoWeekOf(mondayOfIsoWeek(w))).toBe(w);
  });

  it('สัปดาห์ที่ไม่มีจริง → RangeError · เลื่อนข้ามปี', () => {
    expect(() => mondayOfIsoWeek('2027-W53')).toThrow(RangeError); // 2027 มี 52 สัปดาห์
    expect(shiftWeek('2026-W53', 1)).toBe('2027-W01');
    expect(shiftWeek('2027-W01', -1)).toBe('2026-W53');
  });
});
