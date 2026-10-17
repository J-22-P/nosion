'use client';

import type { CreateRecurrenceRuleInput } from '@nosion/contracts';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { recurrenceApi } from './api';
import { toRuleInput, validateDraft, type RecurrenceDraft } from './builder';
import { errorText } from '@/i18n/errors';
import { tr } from '@/i18n/current';

/** ค่าที่นิ่งแล้ว `delay` ms — ผู้ใช้กดปรับตัวเลือกรัว ๆ ไม่ยิง preview ทุกครั้ง (endpoint จำกัด 60/นาที) */
export function useDebounced<T>(value: T, delay = 300): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return settled;
}

/**
 * preview 10 รอบถัดไปของกฎที่กำลังสร้าง — engine ฝั่ง API เป็นผู้คำนวณ (โซนเวลา/DST/clamp ตรงกับตอนบันทึกจริง)
 * draft ที่ยังผิดอยู่ไม่ยิง · ระหว่างรอผลใหม่ยังแสดงผลเดิม (ไม่กระพริบ)
 */
export function useDraftPreview(draft: RecurrenceDraft, enabled = true) {
  const settled = useDebounced(draft);
  const valid = Object.keys(validateDraft(settled)).length === 0;
  const input = { ...toRuleInput(settled), limit: 10 };
  const query = useQuery({
    queryKey: ['recurrence', 'preview', input],
    queryFn: () => recurrenceApi.previewDraft(input),
    enabled: enabled && valid,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    retry: false,
  });
  // ระหว่างรอ debounce key ยังไม่เปลี่ยน (isPlaceholderData ยังเป็น false) แต่รายการที่เห็นเป็นของค่าเก่าแล้ว
  return { ...query, isOutdated: settled !== draft || query.isPlaceholderData };
}

/** สร้างกฎ — API materialize ล่วงหน้า 90 วันทันที รายการจึงโผล่ในทุกการ์ดที่ฟัง ['entries'] */
export function useCreateRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateRecurrenceRuleInput) => recurrenceApi.create(input),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ['entries'] }),
  });
}

/** ปุ่ม "Materialize Recurrence" ใน Today — idempotent กดซ้ำได้ (จำกัด 6 ครั้ง/นาทีที่ API) */
export function useMaterialize() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: recurrenceApi.materialize,
    onSuccess: ({ rules, created }) =>
      toast.success(
        created > 0 ? tr('rb.materialized', { count: created }) : tr('rb.materializedNone'),
        {
          description: tr('rb.materializeDetail', { rules }),
        },
      ),
    onError: (error) =>
      toast.error(tr('rb.materializeFailed'), {
        description: errorText(error),
      }),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ['entries'] }),
  });
}
