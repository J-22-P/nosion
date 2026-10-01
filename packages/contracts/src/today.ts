import type { EntryStatus, ModuleKey, Priority } from './enums';

/**
 * GET /today (สเปก 7.4) — รวม widget ทุกโมดูลในคำขอเดียว
 * ทุก widget มาจาก module.summarizeToday() · core ไม่รู้จัก field เฉพาะโมดูล (อยู่ใน `data`)
 */
export interface TodayWidgetItemDto {
  entryId: string;
  title: string;
  status: EntryStatus;
  priority?: Priority;
  /** ISO 8601 */
  occurredAt: string | null;
  detail?: string;
}

export interface TodayWidgetDto {
  module: ModuleKey;
  title: string;
  order: number;
  headline: string;
  subline?: string;
  items: TodayWidgetItemDto[];
  isEmpty: boolean;
  emptyCta?: { label: string; href: string };
  /** เงินเป็นหน่วยย่อยเสมอ · total null = ไม่มีเป้า/งบ */
  progress?: { done: number; total: number | null };
  alerts?: { level: 'info' | 'warning' | 'danger'; message: string }[];
  actions?: { label: string; href: string }[];
  /** ข้อมูลเฉพาะโมดูล — UI ของโมดูลนั้นตีความเอง */
  data?: Record<string, unknown>;
}

export interface TodayDto {
  /** 'YYYY-MM-DD' ตามโซนผู้ใช้ */
  date: string;
  timezone: string;
  /** "สวัสดีตอนเช้า Jay" — เช้า < 12:00 ≤ บ่าย < 18:00 ≤ เย็น (เวลาท้องถิ่นผู้ใช้) */
  greeting: string;
  /** เรียงตาม order จาก registry */
  widgets: TodayWidgetDto[];
  /** โมดูลที่สรุปไม่สำเร็จ — หน้าแสดง error state เฉพาะการ์ดนั้น ส่วนอื่นยังใช้ได้ */
  failedModules: ModuleKey[];
}

// ── GET /tasks/standup/today ─────────────────────
export interface StandupItemDto {
  id: string;
  title: string;
  /** เลยกำหนด / รออะไร / project */
  note?: string;
}

export interface StandupDto {
  date: string;
  done: StandupItemDto[];
  doing: StandupItemDto[];
  blocked: StandupItemDto[];
  markdown: string;
}
