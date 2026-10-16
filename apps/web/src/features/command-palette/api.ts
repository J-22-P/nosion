import type { ParseCommitDto, ParseCommitInput, ParseResultDto } from '@nosion/contracts';
import { apiFetch } from '@/lib/api-client';

/** NL Parser ข้ามโมดูล (สเปก 6.4 · 8.3) */
export const parseApi = {
  preview: (text: string) => apiFetch<ParseResultDto>('/parse', { method: 'POST', body: { text } }),
  commit: (input: ParseCommitInput) =>
    apiFetch<ParseCommitDto>('/parse/commit', { method: 'POST', body: input }),
};
