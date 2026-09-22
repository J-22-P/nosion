import { z } from 'zod';

/** ต้องตรงกับ enum ใน Prisma schema เสมอ — เป็นแหล่งความจริงเดียวของทั้ง FE/BE */
export const moduleKeySchema = z.enum(['task', 'expense', 'workout', 'habit']);
export type ModuleKey = z.infer<typeof moduleKeySchema>;
export const MODULE_KEYS = moduleKeySchema.options;

export const entryStatusSchema = z.enum(['pending', 'active', 'done', 'skipped', 'cancelled']);
export type EntryStatus = z.infer<typeof entryStatusSchema>;

export const prioritySchema = z.enum(['none', 'low', 'medium', 'high', 'urgent']);
export type Priority = z.infer<typeof prioritySchema>;
/** เรียงจากน้อยไปมาก — ใช้ sort และ map ปุ่ม 1-4 */
export const PRIORITY_ORDER: Record<Priority, number> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
  urgent: 4,
};

export const reminderChannelSchema = z.enum(['push', 'email', 'webhook']);
export type ReminderChannel = z.infer<typeof reminderChannelSchema>;

export const reminderStatusSchema = z.enum(['scheduled', 'sent', 'failed', 'cancelled']);
export type ReminderStatus = z.infer<typeof reminderStatusSchema>;

export const recurrenceEndTypeSchema = z.enum(['never', 'onDate', 'afterCount']);
export type RecurrenceEndType = z.infer<typeof recurrenceEndTypeSchema>;
