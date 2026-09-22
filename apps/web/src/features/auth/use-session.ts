'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { ApiError } from '@/lib/api-client';
import { authApi } from './api';
import { useAuthStore } from './auth-store';

/**
 * เรียกครั้งเดียวตอนแอปขึ้น: ขอ access token ใหม่จาก refresh cookie แล้วค่อยโหลดโปรไฟล์
 * ผลลัพธ์: รีเฟรชหน้าแล้วยัง login อยู่ ทั้งที่ access token ไม่เคยถูกเก็บลงดิสก์
 */
export function useSession() {
  const { user, status, setSession, clear, accessToken } = useAuthStore();

  const query = useQuery({
    queryKey: ['session'],
    retry: false,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      if (!useAuthStore.getState().accessToken) {
        const refreshed = await authApi.refresh().catch(() => null);
        if (!refreshed) return null;
        useAuthStore.getState().setToken(refreshed.accessToken);
      }
      return authApi.me();
    },
  });

  useEffect(() => {
    if (query.isPending) return;
    const me = query.data;
    const token = useAuthStore.getState().accessToken;
    if (me && token) {
      setSession(token, me.user);
    } else if (!(query.error instanceof ApiError) || query.error.status === 401) {
      clear();
    }
  }, [query.data, query.error, query.isPending, setSession, clear]);

  return {
    user,
    settings: query.data?.settings,
    status,
    isLoading: query.isPending || status === 'loading',
    isAuthenticated: Boolean(user && accessToken),
  };
}
