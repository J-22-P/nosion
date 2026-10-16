import type { HabitDayState } from '@nosion/contracts';

/**
 * streak ของนิสัย — pure (สเปก 7.3 `GET /habits/streaks`)
 *
 * ทำงานบน "รอบ" (วันที่มี entry) ไม่ใช่ทุกวันในปฏิทิน: นิสัยเฉพาะวันจันทร์ไม่ขาดเพราะวันอังคาร
 *  - ทำครบ = +1 · ข้ามโดยตั้งใจ (skipped) = ไม่นับ ไม่ตัด · ไม่ทำ = ตัด
 *  - **วันนี้ยังไม่ทำ = ยังไม่ตัด** (วันยังไม่จบ) — เริ่มนับจากเมื่อวาน
 */
export interface HabitDay {
  /** 'YYYY-MM-DD' ตามโซนผู้ใช้ */
  date: string;
  complete: boolean;
  skipped: boolean;
}

export interface Streak {
  current: number;
  longest: number;
}

function run(days: HabitDay[], today: string): Streak {
  let longest = 0;
  let length = 0;
  for (const d of days) {
    if (d.skipped) continue;
    if (d.complete) {
      length += 1;
      longest = Math.max(longest, length);
    } else if (d.date !== today) {
      length = 0;
    }
  }
  return { current: length, longest };
}

/** เรียงจากเก่าไปใหม่ · วันหลัง `today` ไม่นับ */
export function dailyStreak(days: HabitDay[], today: string): Streak {
  const past = [...days]
    .filter((d) => d.date <= today)
    .sort((a, b) => a.date.localeCompare(b.date));
  return run(past, today);
}

const asDate = (ymd: string) => new Date(`${ymd}T00:00:00Z`);

function weekStart(ymd: string, weekStartsOn: number): string {
  const d = asDate(ymd);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() - weekStartsOn + 7) % 7));
  return d.toISOString().slice(0, 10);
}

/**
 * นิสัย "N ครั้งต่อสัปดาห์" — นับสัปดาห์ที่ทำครบเป้าต่อกัน · สัปดาห์นี้ยังไม่ครบ = ยังไม่ตัด
 * สัปดาห์ที่ไม่มีรอบเลย (หยุดนิสัยไว้) = ไม่นับ ไม่ตัด
 */
export function weeklyStreak(
  days: HabitDay[],
  weeklyTarget: number,
  today: string,
  weekStartsOn = 1,
): Streak {
  const thisWeek = weekStart(today, weekStartsOn);
  const weeks = new Map<string, number>();
  for (const d of days) {
    if (d.date > today) continue;
    const w = weekStart(d.date, weekStartsOn);
    weeks.set(w, (weeks.get(w) ?? 0) + (d.complete ? 1 : 0));
  }
  const asDays: HabitDay[] = [...weeks.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([w, done]) => ({ date: w, complete: done >= weeklyTarget, skipped: false }));
  return run(asDays, thisWeek);
}

/** สถานะของแต่ละวันในแถบ 7 วัน (วันนี้ยังไม่ทำ = pending ไม่ใช่ missed) */
export function dayState(day: HabitDay | undefined, today: string): HabitDayState {
  if (!day) return 'none';
  if (day.complete) return 'done';
  if (day.skipped) return 'skipped';
  return day.date === today ? 'pending' : 'missed';
}
