'use client';

import {
  OAUTH_ERRORS,
  type OAuthAccountsDto,
  type OAuthErrorCode,
  type OAuthLinkDto,
  type OAuthProvider,
  type OAuthProvidersDto,
} from '@nosion/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { API_URL, apiFetch } from '@/lib/api-client';
import { useTranslations } from 'next-intl';
import { useApiErrorText } from '@/i18n/errors';

export const PROVIDER_LABEL: Record<OAuthProvider, string> = {
  google: 'Google',
  github: 'GitHub',
};

/** `?oauth_error=` จาก API → ข้อความที่ผู้ใช้อ่านเข้าใจ (ไม่แสดงข้อความดิบของผู้ให้บริการ) */
export function useOAuthErrorMessage() {
  const t = useTranslations('oauth.error');
  /** `reason` = `?oauth_reason=` (รหัสมาตรฐานของผู้ให้บริการ) — ต่อท้ายให้คนตั้งค่ารู้ว่าต้องแก้อะไร */
  return (code: string | null, reason?: string | null): string | null => {
    if (!code) return null;
    const message = (OAUTH_ERRORS as readonly string[]).includes(code)
      ? t(code as OAuthErrorCode)
      : t('unknown');
    return reason && /^[a-z0-9_]{1,64}$/i.test(reason) ? `${message} (${reason})` : message;
  };
}

/** URL เริ่ม flow — เปิดแบบ top-level (ไม่ใช่ fetch) · แนบโซนเวลาของเครื่องให้บัญชีใหม่ */
export function oauthStartUrl(provider: OAuthProvider): string {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const q = tz ? `?${new URLSearchParams({ tz })}` : '';
  return `${API_URL}/api/v1/auth/oauth/${provider}${q}`;
}

export function useOAuthProviders() {
  return useQuery({
    queryKey: ['oauth-providers'],
    queryFn: () => apiFetch<OAuthProvidersDto>('/auth/oauth/providers', { anonymous: true }),
    staleTime: 10 * 60_000,
  });
}

const ACCOUNTS_KEY = ['oauth-accounts'] as const;

export function useOAuthAccounts() {
  return useQuery({
    queryKey: ACCOUNTS_KEY,
    queryFn: () => apiFetch<OAuthAccountsDto>('/me/oauth-accounts'),
  });
}

/** ผูกบัญชี: ขอ URL ที่มี token อายุสั้น แล้วพาเบราว์เซอร์ไปหน้าผู้ให้บริการ */
export function useLinkOAuth() {
  const t = useTranslations('oauth');
  const apiErrorText = useApiErrorText();
  return useMutation({
    mutationFn: ({
      provider,
      includePrivateRepos = false,
    }: {
      provider: OAuthProvider;
      includePrivateRepos?: boolean;
    }) =>
      apiFetch<OAuthLinkDto>(`/auth/oauth/${provider}/link`, {
        method: 'POST',
        body: { includePrivateRepos },
      }),
    onSuccess: ({ url }) => {
      window.location.assign(url);
    },
    onError: (error) => toast.error(t('linkFailed'), { description: apiErrorText(error) }),
  });
}

export function useUnlinkOAuth() {
  const queryClient = useQueryClient();
  const t = useTranslations('oauth');
  const apiErrorText = useApiErrorText();
  return useMutation({
    mutationFn: (provider: OAuthProvider) =>
      apiFetch<void>(`/me/oauth-accounts/${provider}`, { method: 'DELETE' }),
    onSuccess: (_, provider) => {
      toast.success(t('unlinked', { provider: PROVIDER_LABEL[provider] }));
      void queryClient.invalidateQueries({ queryKey: ACCOUNTS_KEY });
    },
    onError: (error) => toast.error(t('unlinkFailed'), { description: apiErrorText(error) }),
  });
}
