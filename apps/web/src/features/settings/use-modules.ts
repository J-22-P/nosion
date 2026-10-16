'use client';

import type { ModuleKey } from '@nosion/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { authApi } from '@/features/auth/api';
import { useSession } from '@/features/auth/use-session';
import { ApiError } from '@/lib/api-client';

/**
 * โมดูลที่เว็บมีหน้าให้ใช้แล้ว — ฝั่ง API ลงทะเบียนเองผ่าน registry
 * Workout ถูกตัดออกจาก Phase 6 (เจ้าของสั่ง 16 ต.ค. 2026) → ยังเปิดไม่ได้
 */
export const AVAILABLE_MODULES: { key: ModuleKey; ready: boolean }[] = [
  { key: 'task', ready: true },
  { key: 'expense', ready: true },
  { key: 'habit', ready: true },
  { key: 'workout', ready: false },
];

/** เปิด/ปิดโมดูลของผู้ใช้ (PATCH /me/settings) — ต้องเหลืออย่างน้อย 1 โมดูล */
export function useEnabledModules() {
  const { settings } = useSession();
  const queryClient = useQueryClient();
  const enabled = (settings?.enabledModules ?? []) as ModuleKey[];

  const update = useMutation({
    mutationFn: (modules: ModuleKey[]) => authApi.updateSettings({ enabledModules: modules }),
    onSuccess: () => {
      // โมดูลที่เปิดเปลี่ยน → Today, ปฏิทิน, นิสัย ต้องถามใหม่ (key ทั้งหมดอยู่ใต้ 'entries')
      void queryClient.invalidateQueries({ queryKey: ['session'] });
      void queryClient.invalidateQueries({ queryKey: ['entries'] });
    },
    onError: (error) =>
      toast.error('บันทึกไม่สำเร็จ', {
        description: error instanceof ApiError ? error.message : undefined,
      }),
  });

  return {
    enabled,
    loaded: settings !== undefined,
    isEnabled: (key: ModuleKey) => enabled.includes(key),
    setEnabled: (key: ModuleKey, on: boolean) => {
      const next = on ? [...new Set([...enabled, key])] : enabled.filter((k) => k !== key);
      if (next.length === 0) {
        toast.error('ต้องเปิดอย่างน้อย 1 โมดูล');
        return;
      }
      update.mutate(next);
    },
    pending: update.isPending,
  };
}
