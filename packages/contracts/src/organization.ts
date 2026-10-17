import { z } from 'zod';
import { moduleKeySchema } from './enums';

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'ต้องเป็นสี hex เช่น #6366f1');

export const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(80),
  color: hexColor.default('#6366f1'),
  icon: z.string().max(32).nullish(),
});
export const updateProjectSchema = createProjectSchema.partial().extend({
  isArchived: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export const createTagSchema = z.object({
  name: z.string().trim().min(1).max(40),
  color: hexColor.default('#94a3b8'),
});
export const updateTagSchema = createTagSchema.partial();

/** "HH:mm" ที่มีอยู่จริง (00:00–23:59) — SQL ของสรุปรายวันแปลงเป็นนาทีแล้วเทียบตรง ๆ จึงรับ "25:99" ไม่ได้ */
const clockTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'เวลาต้องเป็น HH:mm (00:00–23:59)');

export const updateSettingsSchema = z.object({
  timezone: z.string().max(64).optional(),
  locale: z.enum(['th', 'en']).optional(),
  /** ปีพุทธศักราช — มีผลเฉพาะภาษาไทย */
  buddhistEra: z.boolean().optional(),
  currency: z.string().length(3).optional(),
  weekStartsOn: z.number().int().min(0).max(6).optional(),
  theme: z.enum(['light', 'dark', 'system']).optional(),
  quietHoursEnabled: z.boolean().optional(),
  quietHoursStart: clockTime.optional(),
  quietHoursEnd: clockTime.optional(),
  dailyDigestEnabled: z.boolean().optional(),
  dailyDigestTime: clockTime.optional(),
  weeklyReviewEnabled: z.boolean().optional(),
  weeklyReviewDay: z.number().int().min(0).max(6).optional(),
  enabledModules: z.array(moduleKeySchema).min(1).optional(),
  /** 15 นาที – 16 ชั่วโมง */
  focusGoalMinutes: z.number().int().min(15).max(960).optional(),
});
export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;

export const updateProfileSchema = z.object({
  displayName: z.string().trim().min(1).max(80).optional(),
  avatarUrl: z.string().url().max(500).nullish(),
});

export interface ProjectDto {
  id: string;
  name: string;
  color: string;
  icon: string | null;
  sortOrder: number;
  isArchived: boolean;
}

export interface TagDto {
  id: string;
  name: string;
  color: string;
}
