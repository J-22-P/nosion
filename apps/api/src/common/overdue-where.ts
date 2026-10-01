import { EntryStatus, type Prisma } from '@prisma/client';

/**
 * "เลยกำหนด" ในรูป Prisma where — กฎเดียวกับ isEntryOverdue() ของ @nosion/core
 *  - งานทั้งวัน: occurredAt (00:00 ของวันกำหนดตามโซนผู้ใช้) < ต้นวันนี้ = วันกำหนดจบไปแล้ว
 *  - งานมีเวลา: occurredAt < ตอนนี้
 * todayStart ต้องเป็นต้นวันตามโซนผู้ใช้ (dayBoundsInTimeZone) ไม่ใช่ 00:00 UTC
 */
export function overdueWhere(now: Date, todayStart: Date): Prisma.EntryWhereInput {
  return {
    status: { in: [EntryStatus.pending, EntryStatus.active] },
    OR: [
      { isAllDay: true, occurredAt: { lt: todayStart } },
      { isAllDay: false, occurredAt: { lt: now } },
    ],
  };
}
