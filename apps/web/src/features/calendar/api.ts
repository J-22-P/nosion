import type { CalendarDto, CalendarFeedDto } from '@nosion/contracts';
import { apiFetch, toQuery } from '@/lib/api-client';

/** ปฏิทินรวม (สเปก 6.3 · 8.11.4) */
export const calendarApi = {
  range: (from: string, to: string) => apiFetch<CalendarDto>(`/calendar${toQuery({ from, to })}`),
  feed: () => apiFetch<CalendarFeedDto>('/calendar/feed'),
  /** .ics ของช่วงวันที่ (ดาวน์โหลดครั้งเดียว ไม่อัปเดตตาม) */
  exportIcs: (from: string, to: string, module?: string[]) =>
    apiFetch<string>(`/calendar/export${toQuery({ from, to, module })}`, { responseType: 'text' }),
  rotateFeed: () => apiFetch<CalendarFeedDto>('/calendar/feed/rotate', { method: 'POST' }),
};
