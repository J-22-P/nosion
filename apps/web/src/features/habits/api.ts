import type { HabitListDto, HabitTodayDto } from '@nosion/contracts';
import { apiFetch } from '@/lib/api-client';

/** endpoint เฉพาะนิสัย (สเปก 7.3) — สร้าง/หยุด/ลบใช้ recurrenceApi และ parseApi */
export const habitsApi = {
  list: () => apiFetch<HabitListDto>('/habits'),
  increment: (entryId: string, delta: 1 | -1) =>
    apiFetch<HabitTodayDto>(`/habits/${entryId}/increment`, { method: 'POST', body: { delta } }),
  check: (entryId: string, done: boolean) =>
    apiFetch<HabitTodayDto>(`/habits/${entryId}/check`, { method: 'POST', body: { done } }),
};
