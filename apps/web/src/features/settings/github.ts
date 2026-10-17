'use client';

import type {
  GitHubIntegrationDto,
  GitHubSyncResultDto,
  GitHubWebhookSecretDto,
} from '@nosion/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ApiError, apiFetch } from '@/lib/api-client';

const KEY = ['integrations', 'github'] as const;

export function useGitHubIntegration() {
  return useQuery({
    queryKey: KEY,
    queryFn: () => apiFetch<GitHubIntegrationDto>('/integrations/github'),
  });
}

export function useGitHubSync() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<GitHubSyncResultDto>('/integrations/github/sync', { method: 'POST' }),
    onSuccess: (r) => {
      const changed = r.created + r.updated + r.completed;
      toast.success(changed ? `ดึงจาก GitHub แล้ว ${changed} รายการ` : 'ไม่มีอะไรใหม่บน GitHub', {
        description: changed
          ? `ใหม่ ${r.created} · อัปเดต ${r.updated} · ปิด ${r.completed}`
          : undefined,
      });
      void queryClient.invalidateQueries({ queryKey: KEY });
      // งานใหม่ต้องขึ้นในรายการงาน/ปฏิทิน/Today
      void queryClient.invalidateQueries({ queryKey: ['entries'] });
    },
    onError: (error) => {
      toast.error('ดึงจาก GitHub ไม่สำเร็จ', {
        description: error instanceof ApiError ? error.message : undefined,
      });
      void queryClient.invalidateQueries({ queryKey: KEY });
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
      toast.error('สร้าง webhook ไม่สำเร็จ', {
        description: error instanceof ApiError ? error.message : undefined,
      }),
  });
}

export function useDisableGitHubWebhook() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<void>('/integrations/github/webhook', { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('ปิด webhook แล้ว');
      void queryClient.invalidateQueries({ queryKey: KEY });
    },
  });
}
