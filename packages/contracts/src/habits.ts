import { z } from 'zod';
import type { EntryStatus } from './enums';
import type { HabitKind } from './payloads';

/**
 * โมดูลนิสัย (สเปก 5.4 · 7.3 · Phase 6)
 * นิสัยหนึ่งตัว = กฎการเกิดซ้ำ (template module=habit) · หนึ่งรอบ = entry ที่ถือ currentValue ของวันนั้น
 * สร้าง/แก้/หยุดนิสัยใช้ /recurrence-rules และ /parse/commit ที่มีอยู่ — endpoint ที่นี่มีแค่สิ่งที่เฉพาะนิสัย
 */

/** สถานะของหนึ่งวันในแถบ 7 วัน */
export type HabitDayState = 'done' | 'missed' | 'skipped' | 'pending' | 'none';

export interface HabitTodayDto {
  entryId: string;
  currentValue: number;
  status: EntryStatus;
  completedAt: string | null;
  version: number;
}

export interface HabitDto {
  ruleId: string;
  title: string;
  kind: HabitKind;
  targetValue: number;
  unit: string;
  deadlineLocalTime: string | null;
  subtitle: string | null;
  cadence: 'daily' | 'weekly';
  weeklyTarget: number | null;
  isPaused: boolean;
  /** รอบของวันนี้ · null = วันนี้ไม่มีรอบ (เช่น นิสัยเฉพาะวันจันทร์) */
  today: HabitTodayDto | null;
  /** daily = นับวัน · weekly = นับสัปดาห์ที่ทำครบเป้า */
  streak: { current: number; longest: number; unit: 'day' | 'week' };
  /** 7 วันล่าสุดถึงวันนี้ ('YYYY-MM-DD' ตามโซนผู้ใช้) */
  last7: { date: string; state: HabitDayState }[];
  /** cadence=weekly — ทำครบกี่วันในสัปดาห์นี้ */
  weekProgress: { done: number; target: number } | null;
}

export interface HabitListDto {
  date: string;
  timezone: string;
  habits: HabitDto[];
}

/** POST /habits/:entryId/increment — ปุ่ม −1 / +1 (สเปก 7.3) · ไม่ต่ำกว่า 0 */
export const habitIncrementSchema = z.object({ delta: z.union([z.literal(1), z.literal(-1)]) });
export type HabitIncrementInput = z.infer<typeof habitIncrementSchema>;

/** POST /habits/:entryId/check — ติ๊กทำแล้ว / ยกเลิก (check · before_time · หรือ count ให้ครบเป้าทีเดียว) */
export const habitCheckSchema = z.object({ done: z.boolean() });
export type HabitCheckInput = z.infer<typeof habitCheckSchema>;
