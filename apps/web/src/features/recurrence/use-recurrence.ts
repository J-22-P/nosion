'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { recurrenceApi } from './api';
import { toRuleInput, validateDraft, type RecurrenceDraft } from './builder';

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
  return useQuery({
    queryKey: ['recurrence', 'preview', input],
    queryFn: () => recurrenceApi.previewDraft(input),
    enabled: enabled && valid,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    retry: false,
  });
}
