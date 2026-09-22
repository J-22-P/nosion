import { BadRequestException } from '@nestjs/common';

/**
 * 'tomorrow' | 'next-week' | ISO date → วันที่เป้าหมาย
 * เป็นฟังก์ชันบริสุทธิ์: ไม่อ่านนาฬิกาเอง ไม่แตะฐานข้อมูล จึงทดสอบ edge case ได้ครบ
 */
export function resolveDeferTarget(to: string, base: Date): Date {
  const day = 24 * 60 * 60 * 1000;
  if (to === 'tomorrow') return new Date(base.getTime() + day);
  if (to === 'next-week') return new Date(base.getTime() + 7 * day);
  const parsed = new Date(to);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException(`วันที่ไม่ถูกต้อง: ${to}`);
  }
  return parsed;
}
