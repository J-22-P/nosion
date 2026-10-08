'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { entriesApi } from '@/features/entries/api';
import { ApiError } from '@/lib/api-client';
import { todayApi } from './api';

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

/** ติ๊กงานเสร็จจากการ์ด Today */
export function useCompleteFromToday() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => entriesApi.complete(id),
    onSuccess: (entry) => toast.success('ทำเสร็จแล้ว', { description: entry.title }),
    onError: (error) =>
      toast.error('ทำเครื่องหมายว่าเสร็จไม่สำเร็จ', {
        description: error instanceof ApiError ? error.message : undefined,
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
