'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { entriesApi } from '@/features/entries/api';
import { queuedNote } from '@/features/entries/use-entries';
import { isQueued } from '@/lib/sync';
import { todayApi } from './api';
import { errorText } from '@/i18n/errors';
import { tr } from '@/i18n/current';

/** key ขึ้นต้นด้วย 'entries' — สร้าง/ติ๊ก/จ่ายบิลที่ไหนก็ตาม การ์ด Today สดตามเอง */
export const TODAY_KEY = ['entries', 'today'] as const;
export const STANDUP_KEY = ['entries', 'standup'] as const;

export const useToday = () =>
  useQuery({
    queryKey: TODAY_KEY,
    queryFn: todayApi.today,
    staleTime: 30_000,
    // ข้ามเที่ยงคืน / ช่วงเวลาทักทายเปลี่ยน — รีเฟรชทุก 5 นาทีพอ
    refetchInterval: 5 * 60_000,
  });

export const useStandup = (enabled: boolean) =>
  useQuery({ queryKey: STANDUP_KEY, queryFn: todayApi.standup, enabled, staleTime: 0 });

/**
 * ติ๊กงานเสร็จ / ยกเลิกเสร็จ (กดผิด) จากการ์ด Today
 * การ์ดไม่มี version ของงาน → ตอนยกเลิกต้องอ่านงานล่าสุดก่อนเพื่อส่ง version ที่ถูกต้อง
 */
export function useToggleFromToday() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, done }: { id: string; done: boolean }) => {
      if (!done) return entriesApi.complete(id);
      const current = await entriesApi.get(id);
      return entriesApi.update(id, { status: 'pending', version: current.version });
    },
    onSuccess: (entry, { done }) =>
      toast.success(done ? tr('today.reopened') : tr('today.completed'), {
        description: isQueued(entry) ? `${entry.title} · ${queuedNote()}` : entry.title,
      }),
    onError: (error, { done }) =>
      toast.error(done ? tr('entries.reopenFailed') : tr('entries.completeFailed'), {
        description: errorText(error),
      }),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ['entries'] }),
  });
}

/** คัดลอก standup markdown — clipboard ใช้ได้เฉพาะ secure context จึงต้องรับมือกรณีล้ม */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
