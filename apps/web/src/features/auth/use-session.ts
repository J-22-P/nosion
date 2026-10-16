'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { ApiError } from '@/lib/api-client';
import { isNetworkError, whenRestored } from '@/lib/sync';
import { authApi, type MeResponse } from './api';
import { useAuthStore } from './auth-store';

/**
 * เรียกครั้งเดียวตอนแอปขึ้น: ขอ access token ใหม่จาก refresh cookie แล้วค่อยโหลดโปรไฟล์
 * ผลลัพธ์: รีเฟรชหน้าแล้วยัง login อยู่ ทั้งที่ access token ไม่เคยถูกเก็บลงดิสก์
 *
 * ออฟไลน์ (Phase 7): ขอ token ไม่ได้ → ใช้โปรไฟล์ที่เก็บไว้ในเครื่อง (แคชจาก IndexedDB) แทนการเด้งไปหน้า login
 * ต่างจาก refresh ที่ถูกปฏิเสธ (401) ซึ่งแปลว่าหมดสิทธิ์จริง → ออกจากระบบตามเดิม
 */
export function useSession() {
  const queryClient = useQueryClient();
  const { user, status, setSession, setOfflineUser, clear } = useAuthStore();

  const query = useQuery({
    queryKey: ['session'],
    retry: false,
    staleTime: 5 * 60 * 1000,
    // 'online' (ค่าเริ่มต้น) จะพัก queryFn ไว้ตอนออฟไลน์ → หน้าค้าง skeleton · ตัวนี้ตัดสินเรื่องออฟไลน์เอง
    networkMode: 'always',
    queryFn: async (): Promise<MeResponse | null> => {
      await whenRestored();
      const cached = () => queryClient.getQueryData<MeResponse | null>(['session']) ?? null;
      try {
        if (!useAuthStore.getState().accessToken) {
          const refreshed = await authApi.refresh().catch((err: unknown) => {
            if (isNetworkError(err)) throw err;
            return null;
          });
          if (!refreshed) return null;
          useAuthStore.getState().setToken(refreshed.accessToken);
        }
        return await authApi.me();
      } catch (err) {
        if (isNetworkError(err) && cached()) return cached();
        throw err;
      }
    },
  });

  useEffect(() => {
    // แคชจากดิสก์อาจมาถึงก่อนผลของรอบนี้ — รอให้จบก่อนค่อยตัดสิน
    if (query.isPending || query.isFetching) return;
    const me = query.data;
    const token = useAuthStore.getState().accessToken;
    if (me && token) {
      setSession(token, me.user);
    } else if (me) {
      setOfflineUser(me.user);
    } else if (!(query.error instanceof ApiError) || query.error.status === 401) {
      clear();
    }
  }, [
    query.data,
    query.error,
    query.isPending,
    query.isFetching,
    setSession,
    setOfflineUser,
    clear,
  ]);

  return {
    user,
    settings: query.data?.settings,
    status,
    isLoading: query.isPending || status === 'loading',
    isAuthenticated: status === 'authenticated' && Boolean(user),
  };
}
