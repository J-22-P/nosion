import type { ReminderChannel } from '@nosion/contracts';
import type { Prisma, ReminderStatus } from '@prisma/client';

/** เวลาที่ต้องยิง = วันของ entry + offset (ลบ = ก่อน) */
export function fireAtFor(occurredAt: Date, offsetMinutes: number): Date {
  return new Date(occurredAt.getTime() + offsetMinutes * 60_000);
}

/**
 * กันตั้งเตือนซ้ำ: entry เดียวกัน + ช่องทางเดียวกัน + offset เดียวกัน = การเตือนเดียวกัน
 * (unique ที่ระดับ DB — กดเพิ่มซ้ำหรือ materialize ซ้ำก็ไม่เกิดแถวใหม่)
 */
export function reminderKey(
  entryId: string,
  channel: ReminderChannel,
  offsetMinutes: number,
): string {
  return `${entryId}:${channel}:${offsetMinutes}`;
}

/**
 * entry ถูกย้ายวัน → การเตือนเลื่อนตาม
 *  - fireAt ใหม่ยังไม่ถึง → ตั้งเตือนใหม่ (scheduled) แม้เคยส่งไปแล้ว: เลื่อนบิลไปพรุ่งนี้ = อยากถูกเตือนอีกครั้งตามวันใหม่
 *  - fireAt ใหม่ผ่านไปแล้ว → เลื่อนเวลาอย่างเดียว ไม่ปลุกสถานะ (ย้อนไปเตือนเรื่องที่ผ่านแล้วไม่มีประโยชน์)
 *  - jobId ล้างทิ้งเสมอ — job ที่ sweeper ส่งเข้าคิวไว้แล้วกลายเป็นของเก่า (worker ตรวจ fireAt ซ้ำก่อนยิง)
 * ผู้ใช้ยกเลิกเอง (cancelled) ไม่ถูกแตะ
 */
export function rescheduleData(
  reminder: { offsetMinutes: number; status: ReminderStatus },
  occurredAt: Date,
  now: Date,
): Prisma.ReminderUpdateManyMutationInput | null {
  if (reminder.status === 'cancelled') return null;
  const fireAt = fireAtFor(occurredAt, reminder.offsetMinutes);
  const rearm = fireAt.getTime() > now.getTime();
  return {
    fireAt,
    jobId: null,
    ...(rearm ? { status: 'scheduled', attempts: 0, sentAt: null, lastError: null } : {}),
  };
}
