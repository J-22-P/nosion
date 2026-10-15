import { z } from 'zod';
import type { EntryDto, ReminderInput } from './entry';
import { moduleKeySchema, type ModuleKey, type Priority } from './enums';
import type { RecurrenceRuleDto } from './recurrence';

/**
 * NL Parser ข้ามโมดูล (สเปก 6.4 · 7.3 "Cross-module" · 8.3 ⌘K)
 *  - `POST /parse`        → preview ไม่บันทึก: ตัวเลือกที่ดีที่สุด + ทางเลือกรอง
 *  - `POST /parse/commit` → บันทึกจริงในคำสั่งเดียว: entry หรือกฎการเกิดซ้ำ + การเตือน + แท็ก/โปรเจกต์
 */
export const parseRequestSchema = z.object({ text: z.string().trim().min(1).max(500) });
export type ParseRequest = z.infer<typeof parseRequestSchema>;

export const parseCommitSchema = parseRequestSchema.extend({
  /** เลือกทางเลือกรอง ("หรือสร้างเป็น… งาน") · ไม่ส่ง = ตัวเลือกที่ดีที่สุด */
  module: moduleKeySchema.optional(),
  /** กันสร้างซ้ำเมื่อกด ↵ รัว ๆ หรือ client ยิงซ้ำ (เฉพาะรายการไม่เกิดซ้ำ) */
  clientId: z.string().max(64).optional(),
});
export type ParseCommitInput = z.infer<typeof parseCommitSchema>;

export interface ParsedEntryDto {
  module: ModuleKey;
  title: string;
  occurredAt: string | null;
  isAllDay: boolean;
  priority: Priority;
  payload: Record<string, unknown>;
  /** RRULE body — มีค่า = บันทึกเป็นกฎการเกิดซ้ำ โดย occurredAt คือรอบแรก */
  rrule: string | null;
  reminders: ReminderInput[];
  /** 0–1 */
  confidence: number;
  matchedTokens: string[];
}

export interface ParseTokenDto {
  kind: string;
  raw: string;
  /** ตำแหน่งใน text (UTF-16 index แบบ String.slice) — ใช้ highlight */
  start: number;
  end: number;
}

export interface ParseResultDto {
  /** null = ไม่มีโมดูลไหนรับข้อความนี้ (เช่น ข้อความมีแต่ #แท็ก) */
  best: ParsedEntryDto | null;
  /** ไม่เกิน 2 ตัว เรียงตามความมั่นใจ */
  alternatives: ParsedEntryDto[];
  /** ชื่อแท็กและโปรเจกต์ตามที่พิมพ์ — ตอน commit ผูกกับของเดิม (ไม่สนตัวพิมพ์) หรือสร้างใหม่ */
  tags: string[];
  project: string | null;
  tokens: ParseTokenDto[];
}

export interface ParseCommitDto {
  /** รายการที่สร้าง — กรณีกฎการเกิดซ้ำคือรอบแรก */
  entry: EntryDto;
  rule: RecurrenceRuleDto | null;
}
