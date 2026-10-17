import type { TodayWidgetDto } from '@nosion/contracts';
import type { TodayWidget } from '@nosion/core';

// อยู่ใน core เพื่อให้เว็บใช้ตัวเดียวกัน (แสดงคำทักทายได้ทันทีโดยไม่รอ API)
export { greetingFor, localHour } from '@nosion/core';

/** domain → DTO: Date เป็น ISO string · ตัด field ที่ undefined ไม่ต้องทำ (JSON ตัดเอง) */
export function toWidgetDto(w: TodayWidget): TodayWidgetDto {
  return {
    ...w,
    items: w.items.map((i) => ({ ...i, occurredAt: i.occurredAt?.toISOString() ?? null })),
  };
}
