import { isInQuietHours, quietHoursEnd } from '@nosion/core';
import type { PrismaClient } from '@prisma/client';
import { PermanentDeliveryError, type ReminderDispatcher } from './dispatcher';
import { buildReminderMessage } from './message';
import type { ReminderJobData } from './sweeper';

/** ครบเท่านี้แล้วยังล้ม = failed (ตรงกับ attempts ของ BullMQ — สเปก 6.2) */
export const MAX_ATTEMPTS = 5;

export type ProcessOutcome =
  | { result: 'sent' }
  | { result: 'skipped'; reason: string }
  | { result: 'deferred'; until: Date }
  | { result: 'failed'; reason: string };

const CLOSED_STATUSES = new Set(['done', 'cancelled', 'skipped']);

/**
 * ชั้นที่ 2 ของ Reminder Engine — ตรวจสถานะล่าสุดจาก DB ก่อนยิงทุกครั้ง
 * (ระหว่างที่ job รอในคิว ผู้ใช้อาจทำเสร็จ ลบ หรือเลื่อนวันไปแล้ว)
 *
 * ส่งแบบ at-least-once: ล้มกลางทางแล้ว retry อาจส่งซ้ำได้ในกรณีที่หายากมาก
 * แต่ notification ใช้ tag เดียวกันต่อ entry เครื่องปลายทางจึงแสดงทับเป็นอันเดียว — ดีกว่าแบบ at-most-once ที่ทำให้การเตือนหายเงียบ
 */
export async function processReminder(
  prisma: PrismaClient,
  dispatcher: ReminderDispatcher,
  data: ReminderJobData,
  now = new Date(),
): Promise<ProcessOutcome> {
  const reminder = await prisma.reminder.findUnique({
    where: { id: data.reminderId },
    include: { entry: { include: { user: { include: { settings: true } } } } },
  });

  // ── Guard clauses: แต่ละข้อคือบั๊กที่เกิดจริงในระบบแบบนี้ ──
  if (!reminder) return { result: 'skipped', reason: 'ไม่พบการเตือน (ถูกลบไปแล้ว)' };
  if (reminder.status !== 'scheduled') {
    return { result: 'skipped', reason: `สถานะ ${reminder.status} — ส่งไปแล้วหรือถูกยกเลิก` };
  }
  if (reminder.fireAt.toISOString() !== data.fireAt) {
    return { result: 'skipped', reason: 'job เก่า — เวลาเตือนถูกเปลี่ยนหลังเข้าคิว' };
  }

  const { entry } = reminder;
  const closeReason = entry.deletedAt
    ? 'รายการถูกลบ'
    : CLOSED_STATUSES.has(entry.status)
      ? `รายการ${entry.status === 'done' ? 'ทำเสร็จ' : 'ปิด'}ก่อนถึงเวลาเตือน`
      : !entry.occurredAt
        ? 'รายการไม่มีวันกำหนดแล้ว'
        : null;
  if (closeReason) {
    await prisma.reminder.update({
      where: { id: reminder.id },
      data: { status: 'cancelled', lastError: closeReason, jobId: null },
    });
    return { result: 'skipped', reason: closeReason };
  }

  const settings = entry.user.settings;
  const timezone = settings?.timezone ?? 'Asia/Bangkok';
  const quiet = {
    enabled: settings?.quietHoursEnabled ?? false,
    start: settings?.quietHoursStart ?? '22:00',
    end: settings?.quietHoursEnd ?? '07:00',
    timezone,
  };
  // webhook คือเครื่องคุยกับเครื่อง — ช่วงห้ามรบกวนมีไว้สำหรับคน
  if (reminder.channel !== 'webhook' && isInQuietHours(now, quiet)) {
    // ไม่ทิ้ง — เลื่อนไปตอนช่วงห้ามรบกวนจบ แล้วให้ sweeper หยิบรอบใหม่
    const until = quietHoursEnd(now, quiet);
    await prisma.reminder.update({
      where: { id: reminder.id },
      data: { fireAt: until, jobId: null },
    });
    return { result: 'deferred', until };
  }

  const message = buildReminderMessage(
    { ...entry, occurredAt: entry.occurredAt! },
    { timezone, currency: settings?.currency ?? 'THB' },
    now,
  );
  try {
    await dispatcher.send(reminder.channel, message);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    const permanent = err instanceof PermanentDeliveryError;
    const attempts = reminder.attempts + 1;
    await prisma.reminder.update({
      where: { id: reminder.id },
      data: {
        attempts,
        lastError: reason.slice(0, 500),
        status: permanent || attempts >= MAX_ATTEMPTS ? 'failed' : 'scheduled',
      },
    });
    if (permanent) return { result: 'failed', reason };
    throw err; // ให้ BullMQ retry ตาม backoff
  }

  await prisma.reminder.update({
    where: { id: reminder.id },
    data: { status: 'sent', sentAt: now, lastError: null },
  });
  return { result: 'sent' };
}
