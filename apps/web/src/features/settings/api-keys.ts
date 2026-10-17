'use client';

import type { ApiKeyDto, CreateApiKeyInput, CreatedApiKeyDto } from '@nosion/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ApiError, apiFetch } from '@/lib/api-client';

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
      toast.error('สร้าง API key ไม่สำเร็จ', {
        description: error instanceof ApiError ? error.message : undefined,
      }),
  });
}

export function useRevokeApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: apiKeysApi.revoke,
    onSuccess: () => {
      toast.success('เพิกถอนแล้ว — key นี้ใช้ไม่ได้ทันที');
      void queryClient.invalidateQueries({ queryKey: KEY });
    },
    onError: (error) =>
      toast.error('เพิกถอนไม่สำเร็จ', {
        description: error instanceof ApiError ? error.message : undefined,
      }),
  });
}
