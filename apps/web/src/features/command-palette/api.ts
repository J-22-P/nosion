import type { EntryDto, ParseCommitDto, ParseCommitInput, ParseResultDto } from '@nosion/contracts';
import { apiFetch } from '@/lib/api-client';
import { localId, offlineCapable } from '@/lib/sync';

/** NL Parser ข้ามโมดูล (สเปก 6.4 · 8.3) */
export const parseApi = {
  preview: (text: string) => apiFetch<ParseResultDto>('/parse', { method: 'POST', body: { text } }),
  /**
   * ออฟไลน์ → เข้าคิวเป็น operation `parse` ให้ server parse ตอนซิงก์ (วันที่ตัดสินด้วยเวลาตอนนั้น
   * — "พรุ่งนี้" ที่พิมพ์ก่อนเที่ยงคืนแล้วซิงก์หลังเที่ยงคืนจะเลื่อนไปหนึ่งวัน: ยอมรับ ดูบันทึกขั้น 2)
   */
  commit: (input: ParseCommitInput) => {
    const clientId = input.clientId ?? `p-${crypto.randomUUID()}`;
    return offlineCapable<ParseCommitDto>({
      online: () =>
        apiFetch<ParseCommitDto>('/parse/commit', {
          method: 'POST',
          body: { ...input, clientId },
        }),
      op: () => ({
        op: 'parse',
        text: input.text,
        module: input.module,
        clientId,
        payloadPatch: input.payloadPatch,
        description: input.description,
      }),
      local: () => {
        const now = new Date().toISOString();
        const entry: EntryDto = {
          id: localId(clientId),
          module: input.module ?? 'task',
          title: input.text.trim(),
          description: input.description ?? null,
          status: 'pending',
          priority: 'none',
          occurredAt: null,
          isAllDay: true,
          completedAt: null,
          payload: input.payloadPatch ?? {},
          projectId: null,
          parentId: null,
          recurrenceRuleId: null,
          tags: [],
          sortOrder: 0,
          version: 1,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        };
        return { entry, rule: null };
      },
    });
  },
};
