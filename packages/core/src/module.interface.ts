import type { ModuleKey } from '@nosion/contracts';
import type { ZodType } from 'zod';
import type {
  CalendarEvent,
  Entry,
  EntryWriteEvent,
  ModuleMeta,
  ParsedEntry,
  TodayWidget,
  UserContext,
  WeeklySection,
} from './domain';

/**
 * สัญญาเดียวที่ทุกโมดูลต้อง implement
 *
 * core ทั้งหมด (Today, Calendar, Weekly Review, ⌘K, NL Parser) วนลูปบน registry
 * จึงไม่มี `if (module === 'expense')` อยู่ใน core แม้แต่ที่เดียว
 * → เพิ่มโมดูลใหม่ = สร้างคลาสใหม่ 1 ไฟล์ แก้โค้ดเดิม 0 บรรทัด
 */
export interface TrackableModule<TPayload = unknown> {
  /** รหัสโมดูล ใช้เป็น discriminator ใน DB */
  readonly key: ModuleKey;

  /** ชื่อที่แสดงผล + ไอคอน + สีประจำโมดูล */
  readonly meta: ModuleMeta;

  /** Zod schema สำหรับ validate payload — บังคับทุกโมดูล */
  readonly payloadSchema: ZodType<TPayload>;

  /** โมดูลนี้ต้องการให้ Recurrence Engine สร้าง entry ซ้ำหรือไม่ */
  readonly supportsRecurrence: boolean;

  /** โมดูลนี้ส่ง reminder ได้หรือไม่ */
  readonly supportsReminder: boolean;

  /** แปลง entry เป็น event สำหรับแสดงบนปฏิทินรวม */
  toCalendarEvent(entry: Entry): CalendarEvent | null;

  /** สรุปข้อมูลโมดูลนี้สำหรับหน้า Today */
  summarizeToday(entries: Entry[], ctx: UserContext): TodayWidget;

  /** สรุปสำหรับ Weekly Review */
  summarizeWeek(entries: Entry[], ctx: UserContext): WeeklySection;

  /** ลองแปลงข้อความธรรมชาติเป็น entry (คืน null ถ้าไม่ใช่ของโมดูลนี้) */
  parseNaturalLanguage(input: string, ctx: UserContext): ParsedEntry | null;

  /** hook หลังสร้าง/แก้ไข/ลบ — ใช้ทำ side effect เฉพาะโมดูล */
  onAfterWrite?(event: EntryWriteEvent): Promise<void>;
}

/** token ของ NestJS DI — provider ทุกตัวที่ติด @RegisterModule() จะถูกรวมมาที่นี่ */
export const MODULE_REGISTRY = Symbol.for('nosion.module-registry');
