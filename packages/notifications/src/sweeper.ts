import type { PrismaClient } from '@prisma/client';

/** ดึงล่วงหน้ากี่นาที (สเปก 6.2: 0–5 นาที) — Redis ถือ job ไม่เกินนี้ ข้อมูลจริงอยู่ใน PostgreSQL */
export const SWEEP_AHEAD_MS = 5 * 60_000;
/**
 * พลาดเวลาไปนานแค่ไหนยังส่ง (worker ล่ม / deploy) — เกินนี้ปิดเป็น failed
 * เตือน "ค่าเน็ตครบกำหนดพรุ่งนี้" ตอนเลยมาแล้วหลายชั่วโมงสร้างความสับสนมากกว่าช่วย
 */
export const MISSED_GRACE_MS = 60 * 60_000;
/** ต่อรอบ — sweeper รันทุกนาที ที่เหลือรอบหน้าเก็บต่อ */
export const SWEEP_BATCH = 500;

export interface ReminderJobData {
  reminderId: string;
  /** fireAt ตอนเข้าคิว — processor เทียบกับ DB เพื่อทิ้ง job ที่เวลาเตือนถูกเปลี่ยนไปแล้ว */
  fireAt: string;
}

export interface EnqueueRequest {
  jobId: string;
  data: ReminderJobData;
  delay: number;
}

/**
 * id ของ job ผูกกับ (reminder, fireAt) — BullMQ ไม่รับ job id ซ้ำ
 * sweeper จึงรันซ้อนกัน / รันทุกนาทีซ้ำได้โดยไม่เกิด job ซ้ำ และ Redis ถูกล้างก็แค่ส่งเข้าคิวใหม่รอบถัดไป
 */
export function jobIdFor(reminderId: string, fireAt: Date): string {
  return `${reminderId}-${fireAt.getTime()}`;
}

/**
 * ชั้นที่ 1 ของ Reminder Engine (transactional outbox + polling publisher — สเปก 6.2)
 * ทุกนาที: ปิดรายการที่พลาดเกิน grace → ส่งที่จะถึงใน 5 นาทีเข้าคิวพร้อม delay → จด jobId กลับลง DB
 */
export async function sweepReminders(
  prisma: PrismaClient,
  enqueue: (request: EnqueueRequest) => Promise<void>,
  now = new Date(),
): Promise<{ enqueued: number; expired: number }> {
  const graceStart = new Date(now.getTime() - MISSED_GRACE_MS);

  const expired = await prisma.reminder.updateMany({
    where: { status: 'scheduled', fireAt: { lt: graceStart } },
    data: {
      status: 'failed',
      lastError: 'พลาดเวลาเตือนเกิน 1 ชั่วโมง — ไม่ส่งย้อนหลัง',
      jobId: null,
    },
  });

  const due = await prisma.reminder.findMany({
    where: {
      status: 'scheduled',
      fireAt: { gte: graceStart, lte: new Date(now.getTime() + SWEEP_AHEAD_MS) },
    },
    select: { id: true, fireAt: true },
    orderBy: { fireAt: 'asc' },
    take: SWEEP_BATCH,
  });

  for (const reminder of due) {
    const jobId = jobIdFor(reminder.id, reminder.fireAt);
    await enqueue({
      jobId,
      data: { reminderId: reminder.id, fireAt: reminder.fireAt.toISOString() },
      delay: Math.max(0, reminder.fireAt.getTime() - now.getTime()),
    });
    // where มี fireAt ด้วย — ถ้าผู้ใช้เลื่อนวันระหว่างนี้ ไม่เขียน jobId เก่าทับ
    await prisma.reminder.updateMany({
      where: { id: reminder.id, fireAt: reminder.fireAt, status: 'scheduled' },
      data: { jobId },
    });
  }

  return { enqueued: due.length, expired: expired.count };
}
