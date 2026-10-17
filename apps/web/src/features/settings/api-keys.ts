'use client';

import type { ApiKeyDto, CreateApiKeyInput, CreatedApiKeyDto } from '@nosion/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api-client';
import { errorText } from '@/i18n/errors';
import { tr } from '@/i18n/current';

const KEY = ['api-keys'] as const;

export const apiKeysApi = {
  list: () => apiFetch<ApiKeyDto[]>('/me/api-keys'),
  create: (input: CreateApiKeyInput) =>
    apiFetch<CreatedApiKeyDto>('/me/api-keys', { method: 'POST', body: input }),
  revoke: (id: string) => apiFetch<void>(`/me/api-keys/${id}`, { method: 'DELETE' }),
};

export function useApiKeys() {
  return useQuery({ queryKey: KEY, queryFn: apiKeysApi.list });
}

export function useCreateApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: apiKeysApi.create,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: KEY }),
    onError: (error) =>
      toast.error(tr('apiKeys.createFailed'), {
        description: errorText(error),
      }),
  });
}

export function useRevokeApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: apiKeysApi.revoke,
    onSuccess: () => {
      toast.success(tr('apiKeys.revoked'));
      void queryClient.invalidateQueries({ queryKey: KEY });
    },
    onError: (error) =>
      toast.error(tr('apiKeys.revokeFailed'), {
        description: errorText(error),
      }),
  });
}
