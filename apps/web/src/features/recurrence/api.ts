import type {
  CreateRecurrenceRuleInput,
  PreviewDraftRuleInput,
  RecurrencePreviewDto,
  RecurrenceRuleDto,
} from '@nosion/contracts';
import { apiFetch } from '@/lib/api-client';

/** กฎการเกิดซ้ำ (สเปก 7.x "Recurrence & Reminder") */
export const recurrenceApi = {
  list: () => apiFetch<RecurrenceRuleDto[]>('/recurrence-rules'),
  create: (input: CreateRecurrenceRuleInput) =>
    apiFetch<RecurrenceRuleDto>('/recurrence-rules', { method: 'POST', body: input }),
  /** กฎที่ยังไม่บันทึก — ไม่เขียน DB · จำกัด 60 ครั้ง/นาที */
  previewDraft: (input: PreviewDraftRuleInput) =>
    apiFetch<RecurrencePreviewDto>('/recurrence-rules/preview', { method: 'POST', body: input }),
  /** ลบกฎ + รอบในอนาคตที่ยังไม่ถูกแตะ (ประวัติคงไว้) */
  remove: (id: string) => apiFetch<void>(`/recurrence-rules/${id}`, { method: 'DELETE' }),
  pause: (id: string, paused: boolean) =>
    apiFetch<RecurrenceRuleDto>(`/recurrence-rules/${id}/pause`, {
      method: 'POST',
      body: { paused },
    }),
  /** ปุ่ม "Materialize Recurrence" — 7 วันข้างหน้า · idempotent · 6 ครั้ง/นาที */
  materialize: () =>
    apiFetch<{ rules: number; created: number }>('/recurrence-rules/materialize', {
      method: 'POST',
    }),
};
