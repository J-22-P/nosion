'use client';

import type {
  GitHubIntegrationDto,
  GitHubSyncResultDto,
  GitHubWebhookSecretDto,
} from '@nosion/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api-client';
import { errorText } from '@/i18n/errors';
import { tr } from '@/i18n/current';

const KEY = ['integrations', 'github'] as const;

export function useGitHubIntegration() {
  return useQuery({
    queryKey: KEY,
    queryFn: () => apiFetch<GitHubIntegrationDto>('/integrations/github'),
  });
}

/** รหัสปัญหาของการดึง (lastSyncError) → ข้อความตามภาษา */
export function syncErrorText(code: string): string {
  return ['revoked', 'forbidden', 'rate_limited', 'unreachable'].includes(code)
    ? tr(`github.syncError.${code}`)
    : tr('github.syncError.other', { code });
}

/** ดึงต่อเองไม่เกินกี่ครั้งต่อการกดหนึ่งครั้ง (ครั้งละ ~40 รายการ · search ของ GitHub ให้สูงสุด 1,000) */
const MAX_ROUNDS = 30;

/**
 * กด "ดึงตอนนี้" → เรียก sync ซ้ำจนเซิร์ฟเวอร์บอกว่าครบ (`more: false`)
 * เซิร์ฟเวอร์แบ่งรอบเพราะเวลาของ function จำกัด — issue หลายร้อยรายการ (รวมที่ปิดแล้ว) ไม่จบในคำขอเดียว
 */
export function useGitHubSync() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const total: GitHubSyncResultDto = {
        created: 0,
        updated: 0,
        completed: 0,
        unchanged: 0,
        more: false,
      };
      const progress = toast.loading(tr('github.syncing'));
      try {
        for (let round = 0; round < MAX_ROUNDS; round++) {
          const r = await apiFetch<GitHubSyncResultDto>('/integrations/github/sync', {
            method: 'POST',
          });
          total.created += r.created;
          total.updated += r.updated;
          total.completed += r.completed;
          total.unchanged += r.unchanged;
          total.more = r.more;
          if (!r.more) break;
          const seen = total.created + total.updated + total.completed + total.unchanged;
          toast.loading(tr('github.syncProgress', { count: seen }), { id: progress });
          // งานที่ได้แล้วขึ้นรายการ/ปฏิทินระหว่างดึงรอบต่อไป
          void queryClient.invalidateQueries({ queryKey: ['entries'] });
        }
      } finally {
        toast.dismiss(progress);
      }
      return total;
    },
    onSuccess: (r) => {
      const changed = r.created + r.updated + r.completed;
      // ค้นแล้วไม่เจอสักรายการ (ไม่ใช่ "ไม่มีอะไรเปลี่ยน") — สาเหตุที่พบบ่อยคือ org ซ่อนงานจากแอปที่ยังไม่อนุมัติ
      if (changed + r.unchanged === 0) {
        toast.warning(tr('github.nothingFound'), {
          description: tr('github.nothingFoundHint'),
          duration: 15_000,
        });
        void queryClient.invalidateQueries({ queryKey: KEY });
        return;
      }
      toast.success(changed ? tr('github.synced', { count: changed }) : tr('github.nothingNew'), {
        description: changed
          ? tr('github.syncedDetail', {
              created: r.created,
              updated: r.updated,
              completed: r.completed,
            })
          : undefined,
      });
      void queryClient.invalidateQueries({ queryKey: KEY });
      // งานใหม่ต้องขึ้นในรายการงาน/ปฏิทิน/Today
      void queryClient.invalidateQueries({ queryKey: ['entries'] });
      void queryClient.invalidateQueries({ queryKey: ['calendar'] });
    },
    onError: async (error) => {
      // เหตุผลที่เจาะจงอยู่ใน lastSyncError (รหัส) — อ่านใหม่แล้วแปลตามภาษา
      const status = await queryClient
        .fetchQuery({
          queryKey: KEY,
          queryFn: () => apiFetch<GitHubIntegrationDto>('/integrations/github'),
          staleTime: 0,
        })
        .catch(() => null);
      toast.error(tr('github.syncFailed'), {
        description: status?.lastSyncError ? syncErrorText(status.lastSyncError) : errorText(error),
      });
      void queryClient.invalidateQueries({ queryKey: ['entries'] });
    },
  });
}

export function useRotateGitHubWebhook() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<GitHubWebhookSecretDto>('/integrations/github/webhook', { method: 'POST' }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: KEY }),
    onError: (error) =>
      toast.error(tr('github.webhookFailed'), {
        description: errorText(error),
      }),
  });
}

export function useDisableGitHubWebhook() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<void>('/integrations/github/webhook', { method: 'DELETE' }),
    onSuccess: () => {
      toast.success(tr('github.webhookDisabled'));
      void queryClient.invalidateQueries({ queryKey: KEY });
    },
  });
}
