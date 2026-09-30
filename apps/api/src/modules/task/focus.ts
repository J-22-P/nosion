/**
 * ตรรกะบริสุทธิ์ของ Focus timer — ไม่แตะฐานข้อมูล ไม่อ่านนาฬิกาเอง (รับ now เข้ามา)
 */

/** เพดานของรอบเดียว: ลืมกดหยุดข้ามคืนต้องไม่กลายเป็นโฟกัส 14 ชั่วโมง */
export const MAX_SESSION_SECONDS = 4 * 60 * 60;

/** วินาทีของรอบ [startedAt, endedAt] หลังจำกัดเพดาน และไม่ติดลบ (นาฬิกาเครื่องเพี้ยน) */
export function sessionSeconds(startedAt: Date, endedAt: Date): number {
  const raw = Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000);
  return Math.min(Math.max(raw, 0), MAX_SESSION_SECONDS);
}

/** นาทีที่บวกเข้า actualMinutes — ปัดแบบปกติ (29 วิ = 0, 30 วิ = 1) */
export function secondsToMinutes(seconds: number): number {
  return Math.round(seconds / 60);
}

export interface SessionLike {
  startedAt: Date;
  endedAt: Date | null;
  durationSeconds: number | null;
}

/**
 * สรุปเวลาโฟกัสของ "วันนี้" [dayStart, dayEnd)
 * - รอบที่จบแล้ว: นับทั้งรอบตามวันที่เริ่ม (รอบ 23:30–00:30 เป็นของวันที่เริ่ม)
 * - รอบที่กำลังจับ: นับเฉพาะส่วนที่อยู่ในวันนี้ (เริ่มเมื่อวานก็นับตั้งแต่เที่ยงคืน)
 */
export function summarizeFocusDay(
  sessions: SessionLike[],
  running: SessionLike | null,
  dayStart: Date,
  dayEnd: Date,
  now: Date,
): { totalSeconds: number; completedSessions: number } {
  const finished = sessions.filter(
    (s) => s.endedAt !== null && s.startedAt >= dayStart && s.startedAt < dayEnd,
  );
  let total = finished.reduce(
    (sum, s) => sum + (s.durationSeconds ?? sessionSeconds(s.startedAt, s.endedAt!)),
    0,
  );

  if (running && running.endedAt === null) {
    const from = running.startedAt > dayStart ? running.startedAt : dayStart;
    const elapsedTotal = sessionSeconds(running.startedAt, now);
    const inToday = sessionSeconds(from, now);
    total += Math.min(inToday, elapsedTotal);
  }

  return { totalSeconds: total, completedSessions: finished.length };
}
