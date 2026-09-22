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
    })
    .nullable()
    .default(null),
  branchName: z.string().max(120).nullable().default(null),
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
export const habitPayloadSchema = z.object({
  /** เป้าหมายต่อรอบ เช่น ดื่มน้ำ 8 แก้ว */
  targetValue: z.number().positive().default(1),
  currentValue: z.number().nonnegative().default(0),
  unit: z.string().max(20).default('ครั้ง'),
  cadence: z.enum(['daily', 'weekly']).default('daily'),
  weeklyTarget: z.number().int().positive().nullable().default(null),
});
export type HabitPayload = z.infer<typeof habitPayloadSchema>;

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
