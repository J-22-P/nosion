import type { PrismaClient } from '@prisma/client';
import type { ReminderDispatcher } from './dispatcher';
import { logger } from './logger';
import { processReminder, RetryableDeliveryError } from './processor';
import { MISSED_GRACE_MS } from './sweeper';

/**
 * ส่งการเตือนที่ถึงเวลาแล้ว "ในคำขอเดียว" — สำหรับรันบน serverless (Vercel) ที่ไม่มี worker ค้าง
 * ตัวเรียก (cron-job.org) ยิง GET /internal/cron/reminders ทุก 1 นาที
 *
 * ต่างจาก worker (sweeper → BullMQ delay → processor) ตรงที่ไม่มีคิว:
 *  - ไม่มี delay ระดับวินาที → ส่งรายการที่ fireAt ≤ ตอนนี้ + 30 วินาที (เร็ว/ช้าได้ไม่เกินราว ±30 วินาทีเมื่อเรียกทุกนาที — ใน DoD ±60)
 *  - ไม่มี retry ของ BullMQ → ล้มชั่วคราวแล้วสถานะยังเป็น scheduled (processor นับ attempts) รอบนาทีถัดไปหยิบใหม่เอง · ครบ 5 = failed
 *  - กันการเรียกซ้อนกัน (ตัวเรียก retry ตอน timeout / function สองตัวทับกัน) ด้วย lease ใน jobId
 *
 * ใช้ processReminder ตัวเดียวกับ worker — guard, ช่วงห้ามรบกวน และข้อความเหมือนกันทุกอย่าง
 */
export const EARLY_MS = 30_000;
/** ถือสิทธิ์ส่งนานเท่าไร — function ตายกลางทาง สิทธิ์หมดแล้วรอบถัดไปหยิบใหม่ */
export const LEASE_MS = 2 * 60_000;
const LEASE_PREFIX = 'cron:';
const BATCH = 100;
/** หยุดหยิบรายการใหม่เมื่อใช้เวลาเกินนี้ — เหลือเวลาให้ function จบก่อน timeout */
const TIME_BUDGET_MS = 20_000;

/** epoch ms ยาว 13 หลักคงที่ (ถึงปี 2286) → เทียบแบบสตริงได้ตรงกับเทียบเวลา */
const leaseId = (at: number) => `${LEASE_PREFIX}${at}`;

export interface DueRemindersResult {
  sent: number;
  skipped: number;
  deferred: number;
  failed: number;
  retrying: number;
  expired: number;
}

export async function runDueReminders(
  prisma: PrismaClient,
  dispatcher: ReminderDispatcher,
  now = new Date(),
  clock: () => number = Date.now,
): Promise<DueRemindersResult> {
  const result: DueRemindersResult = {
    sent: 0,
    skipped: 0,
    deferred: 0,
    failed: 0,
    retrying: 0,
    expired: 0,
  };
  const started = clock();
  const graceStart = new Date(now.getTime() - MISSED_GRACE_MS);

  const expired = await prisma.reminder.updateMany({
    where: { status: 'scheduled', fireAt: { lt: graceStart } },
    data: {
      status: 'failed',
      lastError: 'พลาดเวลาเตือนเกิน 1 ชั่วโมง — ไม่ส่งย้อนหลัง',
      jobId: null,
    },
  });
  result.expired = expired.count;

  const due = await prisma.reminder.findMany({
    where: {
      status: 'scheduled',
      fireAt: { gte: graceStart, lte: new Date(now.getTime() + EARLY_MS) },
    },
    select: { id: true, fireAt: true },
    orderBy: { fireAt: 'asc' },
    take: BATCH,
  });

  for (const reminder of due) {
    if (clock() - started > TIME_BUDGET_MS) break;

    // จองสิทธิ์ — ได้เฉพาะเมื่อไม่มีใครถือ หรือ lease เดิมหมดอายุแล้ว (เขียนใน WHERE เดียว จึงไม่มีสองตัวได้พร้อมกัน)
    const lease = leaseId(now.getTime());
    const claimed = await prisma.reminder.updateMany({
      where: {
        id: reminder.id,
        status: 'scheduled',
        fireAt: reminder.fireAt,
        OR: [
          { jobId: null },
          { jobId: { lt: leaseId(now.getTime() - LEASE_MS), startsWith: LEASE_PREFIX } },
        ],
      },
      data: { jobId: lease },
    });
    if (claimed.count !== 1) continue;

    try {
      const outcome = await processReminder(
        prisma,
        dispatcher,
        { reminderId: reminder.id, fireAt: reminder.fireAt.toISOString() },
        now,
      );
      if (outcome.result === 'sent') result.sent += 1;
      else if (outcome.result === 'skipped') result.skipped += 1;
      else if (outcome.result === 'deferred') result.deferred += 1;
      else result.failed += 1;
    } catch (err) {
      // ล้มชั่วคราว — processor บันทึก attempts แล้ว · ปล่อย lease ให้นาทีถัดไปลองใหม่
      result.retrying += 1;
      await prisma.reminder.updateMany({
        where: { id: reminder.id, jobId: lease },
        data: { jobId: null },
      });
      if (!(err instanceof RetryableDeliveryError)) {
        logger.error(
          { reminderId: reminder.id, err: (err as Error).message },
          'ส่งการเตือนไม่สำเร็จ',
        );
      }
    }
  }
  return result;
}
