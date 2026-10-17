import { z } from 'zod';
import { createEntrySchema, type EntryDto } from './entry';
import { moduleKeySchema } from './enums';

/**
 * Offline sync (สเปก 7.4 `POST /sync/push` · 8.6 · Phase 7)
 *
 * client เก็บสิ่งที่ทำตอนออฟไลน์เป็น operation ใน outbox (IndexedDB) แล้วส่งเป็นชุดเมื่อเน็ตกลับมา
 *  - ทุก operation มี `opId` (uuid) = idempotency key — ส่งซ้ำได้ผลเดิม ไม่ทำซ้ำ
 *  - อ้างรายการที่สร้างตอนออฟไลน์ด้วย `clientId` (ยังไม่มี id จริง) — server แปลงให้
 *  - ประมวลผลตามลำดับที่ส่ง · ผลรายตัว (partial success) — ตัวหนึ่งล้มไม่ล้มทั้งชุด
 */

/** อ้างถึงรายการ: id จริง หรือ clientId ของรายการที่สร้างตอนออฟไลน์ */
const targetSchema = z
  .object({ id: z.string().min(1).optional(), clientId: z.string().min(1).max(64).optional() })
  .refine(
    (t) => Boolean(t.id) !== Boolean(t.clientId),
    'ต้องระบุ id หรือ clientId อย่างใดอย่างหนึ่ง',
  );
export type SyncTarget = z.infer<typeof targetSchema>;

const base = { opId: z.string().min(8).max(64), at: z.string().datetime({ offset: true }) };

/** field ที่แก้จากออฟไลน์ได้ — ชุดเดียวกับ PATCH /entries (ยกเว้น version ซึ่งอยู่ที่ตัว operation) */
const editableFields = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().max(20_000).nullable(),
    status: z.enum(['pending', 'active', 'done', 'skipped', 'cancelled']),
    priority: z.enum(['none', 'low', 'medium', 'high', 'urgent']),
    occurredAt: z.string().nullable(),
    isAllDay: z.boolean(),
    projectId: z.string().nullable(),
    payload: z.record(z.unknown()),
  })
  .partial();
export type SyncEditableFields = z.infer<typeof editableFields>;

export const syncOperationSchema = z.discriminatedUnion('op', [
  /** สร้างรายการ — clientId บังคับ (กันซ้ำ + ให้ operation หลังจากนี้อ้างถึงได้) */
  z.object({
    ...base,
    op: z.literal('create'),
    data: createEntrySchema.extend({ clientId: z.string().min(1).max(64) }),
  }),
  /**
   * แก้ field — `base` = ค่าของ field เหล่านั้นตอนที่ client แก้ (ก่อนแก้)
   * server ใช้ตัดสิน conflict ระดับ field: ค่าบน server ยังเท่า base = ไม่มีใครแก้ → ใช้ของ client
   */
  z.object({
    ...base,
    op: z.literal('update'),
    target: targetSchema,
    version: z.number().int().positive().optional(),
    data: editableFields,
    base: editableFields,
  }),
  z.object({ ...base, op: z.literal('complete'), target: targetSchema }),
  z.object({
    ...base,
    op: z.literal('defer'),
    target: targetSchema,
    to: z.string().min(1).max(32).default('tomorrow'),
  }),
  z.object({ ...base, op: z.literal('delete'), target: targetSchema }),
  z.object({ ...base, op: z.literal('restore'), target: targetSchema }),
  /** บันทึกด่วน / ⌘K ตอนออฟไลน์ — server parse ข้อความตอนซิงก์ (parser ตัดสินด้วยวันเวลาตอนนั้น) */
  z.object({
    ...base,
    op: z.literal('parse'),
    text: z.string().trim().min(1).max(500),
    module: moduleKeySchema.optional(),
    clientId: z.string().min(1).max(64),
    payloadPatch: z.record(z.unknown()).optional(),
    description: z.string().max(20_000).optional(),
  }),
]);
export type SyncOperation = z.infer<typeof syncOperationSchema>;
export type SyncOperationInput = z.input<typeof syncOperationSchema>;

export const syncPushSchema = z.object({
  operations: z.array(syncOperationSchema).min(1).max(100),
});
export type SyncPushInput = z.input<typeof syncPushSchema>;

/**
 * ผลของแต่ละ operation (สเปก 7.4 นโยบาย conflict)
 *  applied   ทำตามที่ขอ
 *  merged    แก้คนละ field กับ server → รวมกันอัตโนมัติ (field-level last-write-wins)
 *  conflict  แก้ field เดียวกัน → server ชนะ · `conflicts` บอก diff ให้ UI แสดง
 *  deleted   รายการถูกลบบน server แล้ว → ลบชนะ (operation ไม่ทำ)
 *  error     ทำไม่ได้ (เช่น ข้อมูลผิด, ไม่พบรายการ) · `error` เป็นข้อความภาษาไทย
 * `replayed: true` = opId นี้เคยประมวลผลแล้ว (ส่งซ้ำ) — ผลที่คืนคือผลเดิม
 */
export type SyncResultStatus = 'applied' | 'merged' | 'conflict' | 'deleted' | 'error';

export interface SyncFieldConflict {
  field: string;
  client: unknown;
  server: unknown;
}

export interface SyncResult {
  opId: string;
  status: SyncResultStatus;
  /** รายการหลังประมวลผล (ไม่มีเมื่อ error / ลบ) */
  entry?: EntryDto;
  /** clientId → id จริง (create / parse) */
  clientId?: string;
  conflicts?: SyncFieldConflict[];
  error?: string;
  replayed?: boolean;
}

export interface SyncPushDto {
  results: SyncResult[];
  serverTime: string;
}

/** GET /sync/pull?since=<ISO> — รายการที่เปลี่ยนตั้งแต่ since (รวมที่ถูกลบ = tombstone) */
export const syncPullSchema = z.object({
  since: z.string().datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});
export type SyncPullQuery = z.infer<typeof syncPullSchema>;

export interface SyncPullDto {
  entries: EntryDto[];
  /** ส่งเป็น since ครั้งถัดไป */
  cursor: string;
  hasMore: boolean;
  serverTime: string;
}
