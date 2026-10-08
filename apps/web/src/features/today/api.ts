import type { StandupDto, TodayDto } from '@nosion/contracts';
import { apiFetch } from '@/lib/api-client';

export const todayApi = {
  today: () => apiFetch<TodayDto>('/today'),
  standup: () => apiFetch<StandupDto>('/tasks/standup/today'),
};
