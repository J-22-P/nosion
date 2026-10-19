import { z } from 'zod';

// ── TASK ───────────────────────────────────────
export const taskPayloadSchema = z.object({
  estimateMinutes: z.number().int().positive().nullable().default(null),
  actualMinutes: z.number().int().nonnegative().default(0),
  /** รายการ checklist ย่อยแบบเบา (ต่างจาก subtask ที่เป็น Entry เต็ม) */
  checklist: z
    .array(
      z.object({
        id: z.string(),
        text: z.string().max(200),
        done: z.boolean().default(false),
      }),
    )
    .max(50)
    .default([]),
  /** ลิงก์ GitHub */
  github: z
    .object({
      repo: z.string(), // "owner/name"
      issueNumber: z.number().int().positive().nullable(),
      prNumber: z.number().int().positive().nullable(),
      /** ปิด task อัตโนมัติเมื่อ PR merged */
      autoCloseOnMerge: z.boolean().default(true),
      /** ลิงก์ไปหน้า issue/PR บน GitHub (มีเมื่อดึงมาจาก GitHub · Phase 8) */
      url: z.string().url().max(500).nullable().default(null),
      /** วันกำหนดจาก milestone ที่ซิงก์ครั้งล่าสุด — วันเปลี่ยนบน GitHub ถึงจะเขียนทับวันที่ผู้ใช้ตั้งเอง */
      milestoneDueOn: z.string().max(40).nullable().default(null),
      /**
       * วันกำหนดจาก GitHub ที่ซิงก์ครั้งล่าสุด (YYYY-MM-DD) — ช่องวันที่ของ GitHub Project (End/Due) ก่อน แล้วค่อย milestone
       * ใช้ตัดสินว่า "วันเปลี่ยนบน GitHub" เหมือน milestoneDueOn (งานที่ซิงก์ก่อนมีช่องนี้ใช้ milestoneDueOn แทน)
       */
      dueOn: z.string().max(40).nullable().default(null),
      /** วันเริ่มจาก GitHub ที่ซิงก์ครั้งล่าสุด (YYYY-MM-DD) — ช่อง Start Date / วันแรกของ Sprint · ใช้ตัดสินแบบเดียวกับ dueOn */
      startOn: z.string().max(40).nullable().default(null),
      /** สถานะบน GitHub ที่ซิงก์ครั้งล่าสุด — ปิด/เปิดงานตาม "การเปลี่ยน" บน GitHub ไม่ทับที่ผู้ใช้ติ๊กเอง */
      state: z.enum(['open', 'closed']).nullable().default(null),
    })
    .nullable()
    .default(null),
  branchName: z.string().max(120).nullable().default(null),
  /**
   * วันเริ่ม (YYYY-MM-DD) — มีวันเริ่ม + วันกำหนด (occurredAt) = ปฏิทินแสดงเป็นแถบยาวตั้งแต่วันเริ่มถึงวันกำหนด
   * (งานที่เสร็จแล้ว: ถึงวันที่ทำเสร็จจริง) · วันกำหนดยังเป็นตัวหลักของ Today / การเตือน / เลยกำหนด
   */
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'วันเริ่มต้องเป็น YYYY-MM-DD')
    .nullable()
    .default(null),
  /** จำนวนครั้งที่ถูกเลื่อน — ใช้ทำสถิติ "งานที่ผัดบ่อยที่สุด" */
  deferCount: z.number().int().nonnegative().default(0),
});
export type TaskPayload = z.infer<typeof taskPayloadSchema>;

// ── EXPENSE ────────────────────────────────────
export const expenseCategorySchema = z.enum([
  'food',
  'transport',
  'housing',
  'utilities',
  'health',
  'entertainment',
  'shopping',
  'education',
  'subscription',
  'debt',
  'savings',
  'other',
]);
export type ExpenseCategory = z.infer<typeof expenseCategorySchema>;

export const expensePayloadSchema = z.object({
  /** หน่วยสตางค์ integer เสมอ — 125.50 บาท = 12550 */
  amountMinor: z.number().int(),
  currency: z.string().length(3).default('THB'),
  /** income = รายรับ, expense = รายจ่าย */
  direction: z.enum(['expense', 'income']).default('expense'),
  category: expenseCategorySchema.default('other'),
  /** fixed = ค่าใช้จ่ายประจำ (บิล), variable = จร */
  costType: z.enum(['fixed', 'variable']).default('variable'),
  merchant: z.string().max(120).nullable().default(null),
  paymentMethod: z.enum(['cash', 'card', 'transfer', 'ewallet', 'other']).default('cash'),
  /** สำหรับบิลรายเดือน: จ่ายแล้วหรือยัง (สถานะ done = จ่ายแล้ว) */
  isBill: z.boolean().default(false),
  note: z.string().max(500).nullable().default(null),
});
export type ExpensePayload = z.infer<typeof expensePayloadSchema>;

// ── WORKOUT ────────────────────────────────────
export const workoutPayloadSchema = z.object({
  workoutType: z.enum(['strength', 'cardio', 'flexibility', 'sport', 'other']),
  /** ป้ายโปรแกรมแบบ split ที่แสดงบนการ์ด Today เช่น "Day A" (v1.1) */
  splitLabel: z.string().max(20).nullable().default(null),
  /** เทมเพลตที่ใช้สร้าง session นี้ — ใช้แนะนำ "โปรแกรมแนะนำวันนี้" (v1.1) */
  templateId: z.string().nullable().default(null),
  durationMinutes: z.number().int().positive().nullable().default(null),
  exercises: z
    .array(
      z.object({
        name: z.string().max(80),
        sets: z
          .array(
            z.object({
              reps: z.number().int().positive().nullable(),
              weightKg: z.number().nonnegative().nullable(),
              distanceKm: z.number().nonnegative().nullable(),
              durationSeconds: z.number().int().positive().nullable(),
              isWarmup: z.boolean().default(false),
            }),
          )
          .max(20),
      }),
    )
    .max(30)
    .default([]),
  /** 1-10 ระดับความเหนื่อย (Rate of Perceived Exertion) */
  rpe: z.number().int().min(1).max(10).nullable().default(null),
  bodyWeightKg: z.number().positive().nullable().default(null),
  note: z.string().max(500).nullable().default(null),
});
export type WorkoutPayload = z.infer<typeof workoutPayloadSchema>;

// ── HABIT ──────────────────────────────────────
/**
 * รูปแบบการบันทึก habit (v1.1 — มาจาก mockup หน้า Today ที่มี habit 3 แบบ)
 *  - count       → นับจำนวน มีปุ่ม −1 / +1        เช่น ดื่มน้ำ 5/8 แก้ว
 *  - check       → ทำ/ไม่ทำ ติ๊กครั้งเดียว           เช่น อ่านหนังสือ 30 นาที
 *  - before_time → ต้องทำก่อนเวลาที่กำหนด (local)   เช่น นอนก่อน 23:45
 */
export const habitKindSchema = z.enum(['count', 'check', 'before_time']);
export type HabitKind = z.infer<typeof habitKindSchema>;

/** "HH:mm" แบบ 24 ชั่วโมง — เข้มกว่า \d{2}:\d{2} เพื่อไม่ให้ "25:99" หลุดเข้า JSONB */
export const localTimeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'ต้องเป็นเวลาแบบ HH:mm (00:00–23:59)');

export const habitPayloadSchema = z
  .object({
    kind: habitKindSchema.default('check'),
    /** เป้าหมายต่อรอบ เช่น ดื่มน้ำ 8 แก้ว (kind=check/before_time ใช้ 1) */
    targetValue: z.number().positive().default(1),
    currentValue: z.number().nonnegative().default(0),
    unit: z.string().max(20).default('ครั้ง'),
    /** หน่วยแปลงสำหรับแสดงผลรอง เช่น 1 แก้ว = 250 ml → "8 แก้ว (2,000 ml)" */
    unitConversion: z
      .object({
        unit: z.string().max(10),
        factor: z.number().positive(),
      })
      .nullable()
      .default(null),
    /** ใช้เมื่อ kind=before_time — "HH:mm" ตาม timezone ของผู้ใช้ */
    deadlineLocalTime: localTimeSchema.nullable().default(null),
    /** คำอธิบายสั้นใต้ชื่อ เช่น "Staff Engineer Path" */
    subtitle: z.string().max(80).nullable().default(null),
    /** daily | weekly — weekly คือ "3 ครั้งต่อสัปดาห์" */
    cadence: z.enum(['daily', 'weekly']).default('daily'),
    weeklyTarget: z.number().int().positive().nullable().default(null),
  })
  .refine((p) => p.kind !== 'before_time' || p.deadlineLocalTime !== null, {
    message: 'before_time ต้องระบุ deadlineLocalTime',
    path: ['deadlineLocalTime'],
  })
  .refine((p) => p.cadence !== 'weekly' || p.weeklyTarget !== null, {
    message: 'cadence=weekly ต้องระบุ weeklyTarget',
    path: ['weeklyTarget'],
  });
export type HabitPayload = z.infer<typeof habitPayloadSchema>;

/** สำเร็จแล้วหรือยังในรอบนี้ — ใช้ร่วมกันระหว่าง widget Today กับ streak ฝั่ง API */
export function isHabitComplete(p: Pick<HabitPayload, 'currentValue' | 'targetValue'>): boolean {
  return p.currentValue >= p.targetValue;
}

export const payloadSchemaByModule = {
  task: taskPayloadSchema,
  expense: expensePayloadSchema,
  workout: workoutPayloadSchema,
  habit: habitPayloadSchema,
} as const;

export type PayloadByModule = {
  task: TaskPayload;
  expense: ExpensePayload;
  workout: WorkoutPayload;
  habit: HabitPayload;
};
