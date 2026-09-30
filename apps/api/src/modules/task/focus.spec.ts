import { describe, expect, it } from 'vitest';
import { MAX_SESSION_SECONDS, secondsToMinutes, sessionSeconds, summarizeFocusDay } from './focus';

const at = (iso: string) => new Date(iso);
// วันที่ 30 ก.ย. 2026 เวลาไทย = [29T17:00Z, 30T17:00Z)
const DAY_START = at('2026-09-29T17:00:00Z');
const DAY_END = at('2026-09-30T17:00:00Z');

describe('sessionSeconds', () => {
  it('คำนวณวินาที และจำกัดเพดาน 4 ชม. กันลืมกดหยุด', () => {
    expect(sessionSeconds(at('2026-09-30T01:00:00Z'), at('2026-09-30T01:25:30Z'))).toBe(1530);
    expect(sessionSeconds(at('2026-09-30T01:00:00Z'), at('2026-09-30T15:00:00Z'))).toBe(
      MAX_SESSION_SECONDS,
    );
  });

  it('นาฬิกาย้อน (end < start) ได้ 0 ไม่ติดลบ', () => {
    expect(sessionSeconds(at('2026-09-30T01:00:00Z'), at('2026-09-30T00:59:00Z'))).toBe(0);
  });
});

describe('secondsToMinutes', () => {
  it('ปัดแบบปกติ', () => {
    expect(secondsToMinutes(29)).toBe(0);
    expect(secondsToMinutes(30)).toBe(1);
    expect(secondsToMinutes(1530)).toBe(26);
  });
});

describe('summarizeFocusDay', () => {
  const now = at('2026-09-30T06:00:00Z'); // 13:00 เวลาไทย

  it('รวมรอบที่จบแล้วของวันนี้ + ส่วนที่ผ่านไปของรอบที่กำลังจับ', () => {
    const result = summarizeFocusDay(
      [
        {
          startedAt: at('2026-09-30T01:00:00Z'),
          endedAt: at('2026-09-30T01:50:00Z'),
          durationSeconds: 3000,
        },
        {
          startedAt: at('2026-09-30T03:00:00Z'),
          endedAt: at('2026-09-30T03:25:00Z'),
          durationSeconds: 1500,
        },
        // เมื่อวาน — ไม่นับ
        {
          startedAt: at('2026-09-29T10:00:00Z'),
          endedAt: at('2026-09-29T11:00:00Z'),
          durationSeconds: 3600,
        },
      ],
      { startedAt: at('2026-09-30T05:30:00Z'), endedAt: null, durationSeconds: null },
      DAY_START,
      DAY_END,
      now,
    );
    expect(result).toEqual({ totalSeconds: 3000 + 1500 + 1800, completedSessions: 2 });
  });

  it('รอบที่เริ่มเมื่อวานแล้วยังจับอยู่ นับเฉพาะตั้งแต่เที่ยงคืน', () => {
    const result = summarizeFocusDay(
      [],
      { startedAt: at('2026-09-29T16:30:00Z'), endedAt: null, durationSeconds: null }, // 23:30 เมื่อวาน
      DAY_START,
      DAY_END,
      at('2026-09-29T17:20:00Z'), // 00:20 วันนี้
    );
    expect(result.totalSeconds).toBe(20 * 60);
  });

  it('ไม่มีอะไรเลย = 0', () => {
    expect(summarizeFocusDay([], null, DAY_START, DAY_END, now)).toEqual({
      totalSeconds: 0,
      completedSessions: 0,
    });
  });
});
