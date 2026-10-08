/**
 * ความกว้างของการ์ดบน desktop (grid 12 คอลัมน์ · สเปก 8.11.1)
 * แถวคู่ 7/5 · แถวคี่ 5/7 — สลับด้านให้สายตาเดินเป็นซิกแซก
 * การ์ดสุดท้ายที่อยู่แถวเดียวเต็มแถว (ปิดโมดูลไปตัวหนึ่งแล้วไม่เหลือช่องโหว่)
 */
export function desktopSpan(index: number, count: number): 5 | 7 | 12 {
  if (index === count - 1 && count % 2 === 1) return 12;
  const row = Math.floor(index / 2);
  const first = index % 2 === 0;
  return (row % 2 === 0) === first ? 7 : 5;
}

/** ช่วงเวลาที่ผู้ใช้กำลังพิมพ์อยู่ — ไม่ให้ shortcut ตัวอักษรเดียวแย่งปุ่ม */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}
