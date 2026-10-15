import type { z } from 'zod';
import type { reminderChannelSchema, reminderStatusSchema } from './enums';
import { reminderInputSchema } from './entry';

/**
 * การเตือนของ entry (สเปก 6.2, 7.x "Recurrence & Reminder")
 * เวลาเตือน = occurredAt + offsetMinutes — entry ต้องมีวันกำหนดก่อนถึงตั้งเตือนได้
 */
export const createReminderSchema = reminderInputSchema;
export type CreateReminderInput = z.input<typeof createReminderSchema>;

export interface ReminderDto {
  id: string;
  entryId: string;
  channel: z.infer<typeof reminderChannelSchema>;
  /** นาทีเทียบ occurredAt (ลบ = ก่อน) */
  offsetMinutes: number;
  /** เวลาที่จะยิงจริง (UTC ISO) */
  fireAt: string;
  status: z.infer<typeof reminderStatusSchema>;
  attempts: number;
  lastError: string | null;
  sentAt: string | null;
  createdAt: string;
}
