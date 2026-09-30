'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api-client';
import { formatDuration } from '@/lib/format';
import { tasksApi } from './api';

/**
 * key ขึ้นต้นด้วย 'entries' โดยตั้งใจ — mutation ของ entry ทุกตัว invalidate ['entries']
 * อยู่แล้ว ตัวเลขใน sidebar จึงสดตามทันทีโดยไม่ต้องไล่เพิ่ม invalidate ทีละจุด
 */
export const TASK_SIDEBAR_KEY = ['entries', 'tasks-sidebar'] as const;
export const FOCUS_TODAY_KEY = ['focus', 'today'] as const;

export function useTaskSidebar() {
  return useQuery({ queryKey: TASK_SIDEBAR_KEY, queryFn: tasksApi.sidebar, staleTime: 30_000 });
}

export function useFocusToday() {
  return useQuery({
    queryKey: FOCUS_TODAY_KEY,
    queryFn: tasksApi.focusToday,
    staleTime: 60_000,
    // ข้ามเที่ยงคืนหรือจับเวลาจากเครื่องอื่น — รีเฟรชทุก 5 นาทีพอ (ตัวเลขวินาทีนับเองฝั่ง client)
    refetchInterval: 5 * 60_000,
  });
}

function useTimerMutation<T>(fn: (id: string) => Promise<T>, errorTitle: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['focus'] });
      // stop บวก actualMinutes และ start เปลี่ยน pending → active
      void queryClient.invalidateQueries({ queryKey: ['entries'] });
    },
    onError: (error) => {
      toast.error(errorTitle, {
        description: error instanceof ApiError ? error.message : undefined,
      });
    },
  });
}

export function useStartTimer() {
  return useTimerMutation(tasksApi.startTimer, 'เริ่มจับเวลาไม่สำเร็จ');
}

export function useStopTimer() {
  const mutation = useTimerMutation(tasksApi.stopTimer, 'หยุดจับเวลาไม่สำเร็จ');
  return {
    ...mutation,
    stop: (id: string) =>
      mutation.mutate(id, {
        onSuccess: (result) =>
          toast.success('บันทึกเวลาโฟกัสแล้ว', {
            description: `+${formatDuration(result.session.durationSeconds ?? 0)} ในงานนี้`,
          }),
      }),
  };
}

/**
 * วินาทีที่ผ่านไปนับจาก startedAt — อัปเดตทุก 1 วิ เฉพาะตอนมีรอบที่กำลังจับ
 * คำนวณจากนาฬิกาเครื่องทุกครั้ง (ไม่ใช่ +1 สะสม) → แท็บถูกพักแล้วกลับมาก็ยังตรง
 */
export function useElapsedSeconds(startedAt: string | null | undefined): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!startedAt) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [startedAt]);
  if (!startedAt) return 0;
  return Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000));
}
