import { dayBoundsInTimeZone } from '@nosion/core';

export interface TaskRanges {
  now: Date;
  /** ต้นวันนี้ (UTC) ตามโซนเวลาของผู้ใช้ */
  todayStart: Date;
  /** ต้นวันพรุ่งนี้ — ใช้เป็นขอบแบบ exclusive (`lt`) */
  todayEnd: Date;
  /** ต้นวันที่ 8 — "7 วันข้างหน้า" = [todayStart, weekEnd) */
  weekEnd: Date;
}

/**
 * ขอบเวลาของ smart list ในหน้า Tasks — pure function รับ now + timezone
 * วันสิ้นสุดคำนวณจากขอบวันของวันที่ 8 ไม่ใช่ +7×24 ชม. เพื่อให้ถูกต้องข้าม DST
 */
export function taskRanges(now: Date, timeZone: string): TaskRanges {
  const today = dayBoundsInTimeZone(now, timeZone);
  // เลื่อนไป "กลางวันที่ 8" แล้วหาขอบวัน → ไม่พลาดแม้วันนั้นยาว 23 หรือ 25 ชม.
  const probe = new Date(today.start.getTime() + 7 * 24 * 60 * 60 * 1000 + 12 * 60 * 60 * 1000);
  const week = dayBoundsInTimeZone(probe, timeZone);
  return { now, todayStart: today.start, todayEnd: today.end, weekEnd: week.start };
}
