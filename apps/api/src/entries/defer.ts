import { BadRequestException } from '@nestjs/common';
import { resolveDateInput } from '@nosion/core';

/**
 * 'tomorrow' | 'next-week' | 'YYYY-MM-DD' | ISO datetime → วันที่เป้าหมาย
 * เป็นฟังก์ชันบริสุทธิ์: ไม่อ่านนาฬิกาเอง ไม่แตะฐานข้อมูล จึงทดสอบ edge case ได้ครบ
 * date ล้วน = 00:00 ตามโซนผู้ใช้ (ไม่ใช่ new Date() ที่ได้ 00:00 UTC)
 */
export function resolveDeferTarget(to: string, base: Date, timeZone: string): Date {
  const day = 24 * 60 * 60 * 1000;
  if (to === 'tomorrow') return new Date(base.getTime() + day);
  if (to === 'next-week') return new Date(base.getTime() + 7 * day);
  if (/^\d{4}-\d{2}-\d{2}$/.test(to)) return resolveDateInput(to, timeZone);
  const parsed = new Date(to);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException(`วันที่ไม่ถูกต้อง: ${to}`);
  }
  return parsed;
}
