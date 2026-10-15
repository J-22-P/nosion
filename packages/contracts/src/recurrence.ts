import { z } from 'zod';
import { moduleKeySchema, prioritySchema, recurrenceEndTypeSchema } from './enums';

/**
 * Recurrence Rule (สเปก 6.1, 7.x "Recurrence & Reminder")
 *
 * เวลา `startsAt` / `endsAt` รับได้สองแบบเหมือน entry:
 *  - ISO datetime ที่มี offset = จุดเวลาจริง
 *  - date ล้วน "YYYY-MM-DD" = เที่ยงคืนของวันนั้นตามโซนของ rule (ใช้กับรายการทั้งวัน เช่นบิล)
 */
const dateInput = z.union([
  z
    .string()
    .datetime({ offset: true })
    .transform((v) => new Date(v)),
  z.date(),
  z.string().date(),
]);

/** ส่วนของ entry ที่ทุกรอบใช้ร่วมกัน — ไม่มี occurredAt (= slot ของแต่ละรอบ) และสถานะ (เริ่มที่ pending เสมอ) */
export const recurrenceTemplateSchema = z.object({
  module: moduleKeySchema,
  title: z.string().trim().min(1).max(200),
  description: z.string().max(20_000).nullish(),
  priority: prioritySchema.default('none'),
  isAllDay: z.boolean().default(true),
  /** validate จริงด้วย payloadSchema ของโมดูลที่ service layer */
  payload: z.record(z.unknown()).default({}),
  projectId: z.string().nullish(),
  tagIds: z.array(z.string()).max(20).default([]),
});
export type RecurrenceTemplate = z.infer<typeof recurrenceTemplateSchema>;
export type RecurrenceTemplateInput = z.input<typeof recurrenceTemplateSchema>;

/** RRULE body เช่น "FREQ=MONTHLY;BYMONTHDAY=31" — ตรวจละเอียดด้วย parseRecurrenceRule ของ @nosion/core */
const rruleString = z.string().trim().min(1).max(500);

const endFields = {
  endType: recurrenceEndTypeSchema.default('never'),
  endsAt: dateInput.nullish(),
  maxCount: z.number().int().min(1).max(1000).nullish(),
};

type EndShape = { endType?: string; endsAt?: unknown; maxCount?: unknown };
/** เงื่อนไขสิ้นสุดต้องมีค่าที่จำเป็นครบ — ตรวจหลัง default ถูกเติมแล้ว */
function refineEnd(value: EndShape, ctx: z.RefinementCtx): void {
  if (value.endType === 'onDate' && !value.endsAt) {
    ctx.addIssue({ code: 'custom', path: ['endsAt'], message: 'endType=onDate ต้องระบุ endsAt' });
  }
  if (value.endType === 'afterCount' && !value.maxCount) {
    ctx.addIssue({
      code: 'custom',
      path: ['maxCount'],
      message: 'endType=afterCount ต้องระบุ maxCount',
    });
  }
}

/** ใช้ทั้งสร้าง rule และ preview ก่อนสร้าง (ตัวสร้าง rrule ในหน้าเว็บ) */
const ruleShape = z.object({
  rrule: rruleString,
  startsAt: dateInput,
  /** IANA timezone · ไม่ส่ง = ใช้โซนของผู้ใช้ */
  timezone: z.string().min(1).max(64).optional(),
  ...endFields,
});

export const createRecurrenceRuleSchema = ruleShape
  .extend({ template: recurrenceTemplateSchema })
  .superRefine(refineEnd);
export type CreateRecurrenceRuleInput = z.input<typeof createRecurrenceRuleSchema>;

/**
 * แก้ทั้ง series — มีผลกับรอบที่ยังไม่ถูกสร้างเท่านั้น
 * entry ที่ materialize แล้วไม่เปลี่ยน (สเปก: "แก้ template ของ rule → entry เก่าต้องไม่เปลี่ยน")
 */
export const updateRecurrenceRuleSchema = z
  .object({
    rrule: rruleString,
    startsAt: dateInput,
    timezone: z.string().min(1).max(64),
    endType: recurrenceEndTypeSchema,
    endsAt: dateInput.nullable(),
    maxCount: z.number().int().min(1).max(1000).nullable(),
    template: recurrenceTemplateSchema,
  })
  .partial()
  .superRefine((value, ctx) => {
    if (value.endType !== undefined) refineEnd(value, ctx);
  });
export type UpdateRecurrenceRuleInput = z.input<typeof updateRecurrenceRuleSchema>;

export const previewQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

/** preview กฎที่ยังไม่บันทึก — ตัวสร้าง rrule เรียกทุกครั้งที่ผู้ใช้ปรับตัวเลือก */
export const previewDraftRuleSchema = ruleShape
  .extend({ limit: z.number().int().min(1).max(50).default(10) })
  .superRefine(refineEnd);
export type PreviewDraftRuleInput = z.input<typeof previewDraftRuleSchema>;

export const pauseRecurrenceRuleSchema = z.object({ paused: z.boolean().default(true) });

/** วันที่ตามปฏิทินของ rule — ลบเฉพาะรอบของวันนั้น */
export const occurrenceDateSchema = z.string().date();

/**
 * ขอบเขตของการแก้/ลบ entry ที่มาจากกฎการเกิดซ้ำ (สเปก 6.1 "แก้ไขรอบเดียว vs ทั้ง series")
 *  - `this`   = เฉพาะรอบนี้ — เลื่อนวันหรือลบแล้ว slot เดิมเข้า exceptions (ค่าเริ่มต้น · entry ปกติใช้ค่านี้เสมอ)
 *  - `series` = รอบนี้ + template ของกฎ → รอบอนาคตที่ผู้ใช้ยังไม่แตะถูกสร้างใหม่ตาม template ใหม่
 *               (ลบ = จบกฎ · รอบที่ผ่านแล้วหรือแก้เองแล้วไม่เปลี่ยน)
 */
export const recurrenceScopeSchema = z.enum(['this', 'series']);
export type RecurrenceScope = z.infer<typeof recurrenceScopeSchema>;

/** `PATCH /entries/:id?scope=` และ `DELETE /entries/:id?scope=` */
export const entryScopeQuerySchema = z.object({ scope: recurrenceScopeSchema.default('this') });

export interface RecurrenceRuleDto {
  id: string;
  rrule: string;
  startsAt: string;
  timezone: string;
  endType: z.infer<typeof recurrenceEndTypeSchema>;
  endsAt: string | null;
  maxCount: number | null;
  /** slot ที่ถูกลบออก (UTC ISO) */
  exceptions: string[];
  template: RecurrenceTemplate;
  isPaused: boolean;
  /** สร้าง entry ล่วงหน้าถึงเวลาไหนแล้ว */
  materializedUntil: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RecurrencePreviewDto {
  timezone: string;
  /** UTC ISO ของแต่ละรอบ */
  occurrences: string[];
  /** 'YYYY-MM-DD' ตามโซนของ rule — ให้ UI แสดงได้โดยไม่ต้องแปลงเอง */
  localDates: string[];
}
