import type { EntryStatus, ModuleKey, Priority, ReminderChannel } from '@nosion/contracts';

/**
 * Entry แบบ domain — ไม่ผูกกับ Prisma
 * (ชั้น persistence แปลงเข้า/ออกที่ repository เท่านั้น)
 */
export interface Entry<TPayload = Record<string, unknown>> {
  id: string;
  userId: string;
  module: ModuleKey;
  title: string;
  description: string | null;
  status: EntryStatus;
  priority: Priority;
  occurredAt: Date | null;
  isAllDay: boolean;
  completedAt: Date | null;
  payload: TPayload;
  projectId: string | null;
  parentId: string | null;
  recurrenceRuleId: string | null;
  recurrenceSlot: Date | null;
  sortOrder: number;
  clientId: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

/** context ของผู้ใช้ที่ทุก engine ต้องใช้ — timezone คือหัวใจ */
export interface UserContext {
  userId: string;
  timezone: string;
  locale: 'th' | 'en';
  currency: string;
  weekStartsOn: number;
  enabledModules: ModuleKey[];
  now?: Date;
}

export interface ModuleMeta {
  label: { th: string; en: string };
  icon: string;
  /** สีประจำโมดูล — ใช้ทั้ง badge, ปฏิทิน และกราฟ */
  color: string;
  description?: { th: string; en: string };
}

export interface CalendarEvent {
  id: string;
  entryId: string;
  module: ModuleKey;
  title: string;
  start: Date;
  end: Date | null;
  allDay: boolean;
  color: string;
  status: EntryStatus;
  meta?: Record<string, unknown>;
}

export interface TodayWidgetItem {
  entryId: string;
  title: string;
  status: EntryStatus;
  priority?: Priority;
  occurredAt: Date | null;
  detail?: string;
}

export interface TodayWidget {
  module: ModuleKey;
  title: string;
  /** ลำดับการแสดงบนหน้า Today — น้อยอยู่บน */
  order: number;
  /** ตัวเลขเด่นของ widget เช่น "3/8 งาน" หรือ "฿1,240" */
  headline: string;
  subline?: string;
  items: TodayWidgetItem[];
  /** true = ไม่มีข้อมูลเลย → หน้า Today แสดง empty state ของ widget นี้ */
  isEmpty: boolean;
  /** ปุ่ม CTA เมื่อว่าง เช่น "เพิ่มงานแรก" */
  emptyCta?: { label: string; href: string };
  /** progress bar ของการ์ด เช่น งาน 2/6 · เงินเป็นหน่วยย่อย (สตางค์) เสมอ */
  progress?: { done: number; total: number | null };
  /** แถบแจ้งเตือนในการ์ด เช่น "หมวดอาหารใช้ไป 87% ของงบแล้ว" — warning → การ์ด soft */
  alerts?: TodayWidgetAlert[];
  /** ปุ่มลัดของการ์ด เช่น "สร้าง standup" */
  actions?: { label: string; href: string }[];
  /**
   * ข้อมูลเฉพาะโมดูลที่ UI ของโมดูลนั้นใช้ (core ไม่อ่าน ไม่ตรวจ)
   * เช่น expense: ยอดวันนี้ / ยอดเดือน / บิลถัดไป
   */
  data?: Record<string, unknown>;
}

export interface TodayWidgetAlert {
  level: 'info' | 'warning' | 'danger';
  message: string;
}

export interface WeeklySectionStat {
  label: string;
  value: string;
  /** เทียบกับสัปดาห์ก่อน (เปอร์เซ็นต์) */
  deltaPct?: number;
}

export interface WeeklySection {
  module: ModuleKey;
  title: string;
  order: number;
  stats: WeeklySectionStat[];
  highlights: string[];
}

/** ผลการแปลงภาษาธรรมชาติ — ยังไม่บันทึกลง DB */
export interface ParsedEntry {
  module: ModuleKey;
  title: string;
  occurredAt: Date | null;
  isAllDay: boolean;
  priority?: Priority;
  payload: Record<string, unknown>;
  reminders?: { channel: ReminderChannel; offsetMinutes: number }[];
  /** 0–1 — ใช้ตัดสินว่าจะโชว์เป็นตัวเลือกแรกใน ⌘K หรือไม่ */
  confidence: number;
  /** ส่วนของ input ที่ parser เข้าใจ — ใช้ highlight ใน UI */
  matchedTokens?: string[];
}

export type EntryWriteOperation = 'create' | 'update' | 'delete' | 'restore' | 'complete';

export interface EntryWriteEvent {
  operation: EntryWriteOperation;
  entry: Entry;
  before?: Entry | null;
  ctx: UserContext;
}
