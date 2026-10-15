import { z } from 'zod';
import {
  moduleKeySchema,
  type EntryStatus,
  type ModuleKey,
  type ReminderChannel,
  type ReminderStatus,
} from './enums';

/**
 * GET /calendar (สเปก 6.3 · 8.11.4) — event ทุกโมดูลในช่วงวันที่ ตามโซนผู้ใช้
 * `from` / `to` เป็นวันบนปฏิทินของผู้ใช้ รวมทั้งสองวัน — month view ส่งช่วง 6 สัปดาห์ของ grid ได้เลย
 */
export const CALENDAR_MAX_DAYS = 93;

export const calendarQuerySchema = z
  .object({
    from: z.string().date(),
    to: z.string().date(),
    /** "task,expense" — กรองเฉพาะ events · countsByModule ยังนับทุกโมดูล (chip แสดงตัวเลขแม้ไม่ได้เลือก) */
    module: z.preprocess(
      (v) => (typeof v === 'string' ? v.split(',').filter(Boolean) : v),
      z.array(moduleKeySchema).optional(),
    ),
  })
  .superRefine((q, ctx) => {
    const days = (Date.parse(q.to) - Date.parse(q.from)) / 86_400_000 + 1;
    if (days < 1) ctx.addIssue({ code: 'custom', path: ['to'], message: 'to ต้องไม่ก่อน from' });
    if (days > CALENDAR_MAX_DAYS) {
      ctx.addIssue({
        code: 'custom',
        path: ['to'],
        message: `ขอได้ไม่เกิน ${CALENDAR_MAX_DAYS} วันต่อครั้ง`,
      });
    }
  });
export type CalendarQuery = z.infer<typeof calendarQuerySchema>;

export type CalendarActionDto =
  | { kind: 'complete'; label: string; presentation: 'checkbox' | 'button' }
  | { kind: 'open'; label: string; href: string };

export interface CalendarEventDto {
  id: string;
  /** null = รอบในอนาคตที่ยังไม่ถูกสร้างเป็น entry (projected) — แสดงได้ แต่ยังกดอะไรไม่ได้ */
  entryId: string | null;
  /** กฎการเกิดซ้ำที่สร้างรายการนี้ */
  ruleId: string | null;
  module: ModuleKey;
  title: string;
  start: string;
  end: string | null;
  allDay: boolean;
  /** 'YYYY-MM-DD' ตามโซนผู้ใช้ — cell ของ grid ไม่ต้องแปลงเวลาเอง */
  date: string;
  status: EntryStatus;
  color: string;
  projected: boolean;
  hasReminder: boolean;
  actions: CalendarActionDto[];
  /** ข้อมูลเฉพาะโมดูล (badge, deepLink, priority, amountMinor…) */
  meta: Record<string, unknown>;
}

/** การเตือนในช่วง — จุด accent บน cell และหัว day panel ("Push 09:00 · ส่งแล้ว") */
export interface CalendarReminderDto {
  entryId: string;
  /** วันที่ยิง ตามโซนผู้ใช้ */
  date: string;
  fireAt: string;
  channel: ReminderChannel;
  status: ReminderStatus;
}

export interface CalendarDto {
  from: string;
  to: string;
  timezone: string;
  /** เรียงตามเวลาเริ่ม (ทั้งวันมาก่อนในวันเดียวกัน) */
  events: CalendarEventDto[];
  /** จำนวน event ต่อโมดูลในช่วงนี้ — ทุกโมดูลที่เปิดอยู่ (0 ได้) */
  countsByModule: Partial<Record<ModuleKey, number>>;
  reminders: CalendarReminderDto[];
}
