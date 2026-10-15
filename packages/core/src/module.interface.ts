import type { ModuleKey } from '@nosion/contracts';
import type { ZodType, ZodTypeDef } from 'zod';
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
import type { NlResult } from './nl';

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

  /**
   * Zod schema สำหรับ validate payload — บังคับทุกโมดูล
   *
   * พารามิเตอร์ที่สามคือชนิดของ "ข้อมูลก่อน parse" ซึ่งต้องเป็น unknown
   * เพราะ schema ที่มี .default() จะมี input ไม่เท่ากับ output
   * (ZodType<T> ตัวเปล่าบังคับให้เท่ากัน ทำให้โมดูลที่มี default ใส่เข้ามาไม่ได้)
   */
  readonly payloadSchema: ZodType<TPayload, ZodTypeDef, unknown>;

  /** โมดูลนี้ต้องการให้ Recurrence Engine สร้าง entry ซ้ำหรือไม่ */
  readonly supportsRecurrence: boolean;

  /** โมดูลนี้ส่ง reminder ได้หรือไม่ */
  readonly supportsReminder: boolean;

  /** แปลง entry เป็น event สำหรับแสดงบนปฏิทินรวม */
  toCalendarEvent(entry: Entry): CalendarEvent | null;

  /**
   * สรุปข้อมูลโมดูลนี้สำหรับหน้า Today
   *
   * entries = รายการของโมดูลนี้ที่ "เกี่ยวกับวันนี้" (เกิดวันนี้ / เสร็จวันนี้ / ค้างถึงวันนี้)
   * คืน Promise ได้ — โมดูลที่ต้องใช้ข้อมูลนอกเหนือจาก entries (เช่น งบทั้งเดือน, บิลถัดไป)
   * ดึงเองผ่าน DI ของตัวเอง core ไม่ต้องรู้ (สเปก 3.2 เขียนเป็น sync — ปรับใน Phase 2b ขั้น 4)
   */
  summarizeToday(entries: Entry[], ctx: UserContext): TodayWidget | Promise<TodayWidget>;

  /** สรุปสำหรับ Weekly Review */
  summarizeWeek(entries: Entry[], ctx: UserContext): WeeklySection;

  /**
   * ตัดสินว่าข้อความที่ parser กลางแยกชิ้นแล้วเป็นของโมดูลนี้ไหม มั่นใจแค่ไหน (คืน null ถ้าไม่ใช่)
   * วันที่ เวลา การเกิดซ้ำ ตัวเลข แยกไว้ให้แล้วที่ @nosion/core/nl — โมดูลไม่ต้องเขียน regex ซ้ำ (สเปก 6.4)
   */
  parseNaturalLanguage(text: NlResult, ctx: UserContext): ParsedEntry | null;

  /** hook หลังสร้าง/แก้ไข/ลบ — ใช้ทำ side effect เฉพาะโมดูล */
  onAfterWrite?(event: EntryWriteEvent): Promise<void>;
}

/** token ของ NestJS DI — provider ทุกตัวที่ติด @RegisterModule() จะถูกรวมมาที่นี่ */
export const MODULE_REGISTRY = Symbol.for('nosion.module-registry');
