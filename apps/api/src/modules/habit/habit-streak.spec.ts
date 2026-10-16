import { describe, expect, it } from 'vitest';
import { dailyStreak, dayState, weeklyStreak, type HabitDay } from './habit-streak';

const day = (date: string, complete: boolean, skipped = false): HabitDay => ({
  date,
  complete,
  skipped,
});
const TODAY = '2026-10-16'; // ศุกร์

describe('dailyStreak', () => {
  it('ต่อกันถึงวันนี้ · วันนี้ยังไม่ทำไม่ตัด (วันยังไม่จบ)', () => {
    const days = [day('2026-10-13', true), day('2026-10-14', true), day('2026-10-15', true)];
    expect(dailyStreak([...days, day(TODAY, false)], TODAY)).toEqual({ current: 3, longest: 3 });
    expect(dailyStreak([...days, day(TODAY, true)], TODAY)).toEqual({ current: 4, longest: 4 });
  });

  it('พลาดหนึ่งวัน = ตัด · longest เก็บสถิติเดิม', () => {
    const days = [
      day('2026-10-09', true),
      day('2026-10-10', true),
      day('2026-10-11', true),
      day('2026-10-12', false),
      day('2026-10-13', true),
      day('2026-10-14', true),
    ];
    expect(dailyStreak(days, TODAY)).toEqual({ current: 2, longest: 3 });
  });

  it('ข้ามโดยตั้งใจไม่ตัด · วันที่ไม่มีรอบ (นิสัยเฉพาะวัน) ไม่ตัด · อนาคตไม่นับ', () => {
    const days = [
      day('2026-10-05', true), // จันทร์
      day('2026-10-12', true), // จันทร์ถัดไป — ระหว่างนั้นไม่มีรอบ
      day('2026-10-14', false, true), // ข้าม
      day('2026-10-15', true),
      day('2026-10-19', false), // อนาคต
    ];
    expect(dailyStreak(days, TODAY)).toEqual({ current: 3, longest: 3 });
  });

  it('เมื่อวานไม่ทำ = streak ปัจจุบัน 0', () => {
    expect(dailyStreak([day('2026-10-14', true), day('2026-10-15', false)], TODAY).current).toBe(0);
  });
});

describe('weeklyStreak (3 ครั้งต่อสัปดาห์)', () => {
  const week = (monday: string, doneDays: number) =>
    Array.from({ length: 7 }, (_, i) => {
      const d = new Date(`${monday}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + i);
      return day(d.toISOString().slice(0, 10), i < doneDays);
    });

  it('นับสัปดาห์ที่ครบเป้า · สัปดาห์นี้ยังไม่ครบไม่ตัด', () => {
    const days = [...week('2026-09-28', 3), ...week('2026-10-05', 4), ...week('2026-10-12', 1)];
    expect(weeklyStreak(days, 3, TODAY, 1)).toEqual({ current: 2, longest: 2 });
  });

  it('สัปดาห์ก่อนไม่ครบ = ตัด', () => {
    const days = [...week('2026-09-28', 3), ...week('2026-10-05', 2), ...week('2026-10-12', 3)];
    expect(weeklyStreak(days, 3, TODAY, 1)).toEqual({ current: 1, longest: 1 });
  });
});

describe('dayState', () => {
  it('วันนี้ยังไม่ทำ = pending · วันก่อน = missed · ไม่มีรอบ = none', () => {
    expect(dayState(day(TODAY, false), TODAY)).toBe('pending');
    expect(dayState(day('2026-10-15', false), TODAY)).toBe('missed');
    expect(dayState(day('2026-10-15', false, true), TODAY)).toBe('skipped');
    expect(dayState(day('2026-10-15', true), TODAY)).toBe('done');
    expect(dayState(undefined, TODAY)).toBe('none');
  });
});
