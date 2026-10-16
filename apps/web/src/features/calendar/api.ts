import type { CalendarDto, CalendarFeedDto } from '@nosion/contracts';
import { apiFetch, toQuery } from '@/lib/api-client';

/** ปฏิทินรวม (สเปก 6.3 · 8.11.4) */
export const calendarApi = {
  range: (from: string, to: string) => apiFetch<CalendarDto>(`/calendar${toQuery({ from, to })}`),
  feed: () => apiFetch<CalendarFeedDto>('/calendar/feed'),
  rotateFeed: () => apiFetch<CalendarFeedDto>('/calendar/feed/rotate', { method: 'POST' }),
};
