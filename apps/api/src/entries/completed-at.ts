/**
 * ค่า completedAt ที่ควรเป็นหลังเปลี่ยนสถานะผ่าน PATCH
 * - เปลี่ยนเป็น done ครั้งแรก → เวลานี้
 * - done อยู่แล้วแก้ซ้ำ → คงเวลาเดิม (ไม่ให้ "เวลาที่เสร็จ" เลื่อนทุกครั้งที่แก้ชื่อ)
 * - สถานะอื่น → null (undo / เปิดงานกลับมาทำ ต้องล้าง ไม่งั้นสถิติรายสัปดาห์นับผิด)
 */
export function completedAtFor(
  status: string,
  before: { status: string; completedAt: Date | null },
  now: Date = new Date(),
): Date | null {
  if (status !== 'done') return null;
  return before.status === 'done' && before.completedAt ? before.completedAt : now;
}
