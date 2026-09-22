/**
 * ตรวจว่า IANA timezone มีจริง — ค่าผิดทำให้ทุก engine คำนวณเวลาเพี้ยนทั้งระบบ
 * แยกเป็นฟังก์ชันบริสุทธิ์เพื่อให้ทดสอบได้โดยไม่ต้องยก NestJS หรือฐานข้อมูล
 */
export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
