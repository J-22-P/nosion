import type {
  FocusSessionDto,
  FocusTodayDto,
  TaskSidebarDto,
  TimerStopResultDto,
} from '@nosion/contracts';
import { apiFetch } from '@/lib/api-client';

/** endpoint เฉพาะโมดูล Task (CRUD ยังอยู่ที่ features/entries/api.ts) */
export const tasksApi = {
  sidebar: () => apiFetch<TaskSidebarDto>('/tasks/sidebar'),
  focusToday: () => apiFetch<FocusTodayDto>('/tasks/focus/today'),
  startTimer: (id: string) =>
    apiFetch<FocusSessionDto>(`/tasks/${id}/timer/start`, { method: 'POST' }),
  stopTimer: (id: string) =>
    apiFetch<TimerStopResultDto>(`/tasks/${id}/timer/stop`, { method: 'POST' }),
};
