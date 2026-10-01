import type { TodayWidgetDto } from '@nosion/contracts';
import type { TodayWidget } from '@nosion/core';

/** ชั่วโมงตามหน้าปัดของผู้ใช้ (0–23) */
export function localHour(now: Date, timeZone: string): number {
  const h = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    hourCycle: 'h23',
  }).format(now);
  return Number(h);
}

/** สเปก 8.11.1: เช้า < 12:00 ≤ บ่าย < 18:00 ≤ เย็น */
export function greetingFor(now: Date, timeZone: string, name: string): string {
  const h = localHour(now, timeZone);
  const part = h < 12 ? 'ตอนเช้า' : h < 18 ? 'ตอนบ่าย' : 'ตอนเย็น';
  return `สวัสดี${part} ${name}`.trim();
}

/** domain → DTO: Date เป็น ISO string · ตัด field ที่ undefined ไม่ต้องทำ (JSON ตัดเอง) */
export function toWidgetDto(w: TodayWidget): TodayWidgetDto {
  return {
    ...w,
    items: w.items.map((i) => ({ ...i, occurredAt: i.occurredAt?.toISOString() ?? null })),
  };
}
