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

export function useGitHubSync() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<GitHubSyncResultDto>('/integrations/github/sync', { method: 'POST' }),
    onSuccess: (r) => {
      const changed = r.created + r.updated + r.completed;
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
    },
    onError: (error) => {
      toast.error(tr('github.syncFailed'), {
        description: errorText(error),
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
