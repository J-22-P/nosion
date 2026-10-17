'use client';

import type {
  OAuthAccountsDto,
  OAuthErrorCode,
  OAuthLinkDto,
  OAuthProvider,
  OAuthProvidersDto,
} from '@nosion/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { API_URL, ApiError, apiFetch } from '@/lib/api-client';

export const PROVIDER_LABEL: Record<OAuthProvider, string> = {
  google: 'Google',
  github: 'GitHub',
};

/** `?oauth_error=` จาก API → ข้อความที่ผู้ใช้อ่านเข้าใจ (ไม่แสดงข้อความดิบของผู้ให้บริการ) */
export const OAUTH_ERROR_MESSAGE: Record<OAuthErrorCode, string> = {
  provider_disabled: 'ระบบนี้ยังไม่ได้เปิดการเข้าสู่ระบบด้วยบัญชีนี้',
  denied: 'ยกเลิกการเข้าสู่ระบบแล้ว',
  state_mismatch: 'ลิงก์หมดอายุหรือเปิดจากหน้าต่างอื่น — ลองกดปุ่มอีกครั้ง',
  exchange_failed: 'ติดต่อผู้ให้บริการไม่สำเร็จ — ลองใหม่อีกครั้ง',
  email_unverified: 'บัญชีนี้ยังไม่มีอีเมลที่ยืนยันแล้ว — ยืนยันอีเมลกับผู้ให้บริการก่อน',
  email_conflict:
    'อีเมลนี้มีบัญชีที่ยังไม่ได้ยืนยันอยู่แล้ว — เข้าสู่ระบบด้วยรหัสผ่าน แล้วเชื่อมบัญชีจากหน้าตั้งค่า',
  already_linked: 'บัญชีนี้ถูกเชื่อมกับผู้ใช้อื่นอยู่แล้ว',
  account_unavailable: 'บัญชีนี้ใช้งานไม่ได้แล้ว',
};

export function oauthErrorMessage(code: string | null): string | null {
  if (!code) return null;
  return OAUTH_ERROR_MESSAGE[code as OAuthErrorCode] ?? 'เข้าสู่ระบบไม่สำเร็จ ลองใหม่อีกครั้ง';
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
    onError: (error) =>
      toast.error('เริ่มเชื่อมบัญชีไม่สำเร็จ', {
        description: error instanceof ApiError ? error.message : undefined,
      }),
  });
}

export function useUnlinkOAuth() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (provider: OAuthProvider) =>
      apiFetch<void>(`/me/oauth-accounts/${provider}`, { method: 'DELETE' }),
    onSuccess: (_, provider) => {
      toast.success(`ยกเลิกการเชื่อม ${PROVIDER_LABEL[provider]} แล้ว`);
      void queryClient.invalidateQueries({ queryKey: ACCOUNTS_KEY });
    },
    onError: (error) =>
      toast.error('ยกเลิกการเชื่อมไม่สำเร็จ', {
        description: error instanceof ApiError ? error.message : undefined,
      }),
  });
}
