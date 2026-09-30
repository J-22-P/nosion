import { z } from 'zod';
import { entryStatusSchema, moduleKeySchema, prioritySchema, reminderChannelSchema } from './enums';
import { cursorPaginationSchema } from './pagination';

/** รับได้ทั้ง ISO string และ Date — คืนเป็น Date เสมอ */
const isoDate = z
  .union([z.string().datetime({ offset: true }), z.string().date(), z.date()])
  .transform((v) => new Date(v));

export const reminderInputSchema = z.object({
  channel: reminderChannelSchema.default('push'),
  /** offset เป็นนาที เทียบ occurredAt (ลบ = ก่อน) */
  offsetMinutes: z.number().int().min(-40320).max(40320).default(0),
});
export type ReminderInput = z.infer<typeof reminderInputSchema>;

export const createEntrySchema = z.object({
  module: moduleKeySchema,
  title: z.string().trim().min(1).max(200),
  description: z.string().max(20_000).nullish(),
  status: entryStatusSchema.default('pending'),
  priority: prioritySchema.default('none'),
  occurredAt: isoDate.nullish(),
  isAllDay: z.boolean().default(true),
  /** validate จริงด้วย payloadSchemaByModule[module] ที่ service layer */
  payload: z.record(z.unknown()).default({}),
  projectId: z.string().nullish(),
  parentId: z.string().nullish(),
  tagIds: z.array(z.string()).max(20).default([]),
  reminders: z.array(reminderInputSchema).max(5).default([]),
  /** client สร้าง id นี้ตอน offline เพื่อกันสร้างซ้ำตอน sync */
  clientId: z.string().max(64).nullish(),
});
export type CreateEntryInput = z.input<typeof createEntrySchema>;

export const updateEntrySchema = createEntrySchema
  .omit({ module: true, clientId: true, reminders: true })
  .partial()
  .extend({
    /** optimistic concurrency — ต้องส่งเวอร์ชันที่ client เห็นล่าสุด */
    version: z.number().int().positive(),
  });
export type UpdateEntryInput = z.input<typeof updateEntrySchema>;

/** แปลง "a,b,c" เป็น array — ใช้กับ query string */
const csv = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess(
    (v) => (typeof v === 'string' ? v.split(',').filter(Boolean) : v),
    z.array(schema).optional(),
  );

/**
 * boolean จาก query string — "true"/"1" = true, "false"/"0" = false
 * (z.coerce.boolean() แปลง "false" เป็น true เพราะเป็น string ไม่ว่าง — กับดักคลาสสิก)
 */
const queryBool = z.preprocess((v) => {
  if (typeof v !== 'string') return v;
  if (v === 'true' || v === '1') return true;
  if (v === 'false' || v === '0' || v === '') return false;
  return v;
}, z.boolean().optional());

export const listEntriesQuerySchema = cursorPaginationSchema.extend({
  module: csv(moduleKeySchema),
  status: csv(entryStatusSchema),
  priority: csv(prioritySchema),
  projectId: z.string().optional(),
  tagIds: csv(z.string()),
  from: isoDate.optional(),
  to: isoDate.optional(),
  q: z.string().trim().min(1).max(100).optional(),
  overdue: queryBool,
  /** ไม่มีโปรเจกต์และไม่มีวันกำหนด (smart list "Inbox" ของหน้า Tasks) */
  inbox: queryBool,
  hasReminder: queryBool,
  parentId: z.string().optional(),
  /** "occurredAt:asc,priority:desc" */
  sort: z.string().default('occurredAt:asc'),
});
export type ListEntriesQuery = z.infer<typeof listEntriesQuerySchema>;

export const bulkActionSchema = z.object({
  ids: z.array(z.string()).min(1).max(200),
  action: z.enum(['complete', 'defer', 'delete', 'move']),
  /** defer → ISO date หรือ 'tomorrow' | move → projectId */
  to: z.string().nullish(),
});
export type BulkActionInput = z.infer<typeof bulkActionSchema>;

export const deferSchema = z.object({
  to: z.union([z.literal('tomorrow'), z.literal('next-week'), z.string()]).default('tomorrow'),
});

export const reorderSchema = z.object({
  items: z
    .array(z.object({ id: z.string(), sortOrder: z.number().int() }))
    .min(1)
    .max(500),
});

/** รูปแบบ entry ที่ API คืนกลับ (serialize เป็น JSON แล้ว) */
export interface EntryDto {
  id: string;
  module: z.infer<typeof moduleKeySchema>;
  title: string;
  description: string | null;
  status: z.infer<typeof entryStatusSchema>;
  priority: z.infer<typeof prioritySchema>;
  occurredAt: string | null;
  isAllDay: boolean;
  completedAt: string | null;
  payload: Record<string, unknown>;
  projectId: string | null;
  parentId: string | null;
  recurrenceRuleId: string | null;
  tags: { id: string; name: string; color: string }[];
  sortOrder: number;
  version: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}
