'use client';

import type { AuthUserDto } from '@nosion/contracts';
import { create } from 'zustand';
import { bindTokenStore } from '@/lib/api-client';

interface AuthState {
  /**
   * access token อยู่ใน memory เท่านั้น — ไม่แตะ localStorage
   * ถ้ามีช่อง XSS token ใน localStorage จะถูกขโมยได้ทันที (สเปกหัวข้อ 9.1)
   */
  accessToken: string | null;
  user: AuthUserDto | null;
  status: 'loading' | 'authenticated' | 'anonymous';
  setSession: (token: string, user: AuthUserDto) => void;
  setToken: (token: string | null) => void;
  setUser: (user: AuthUserDto | null) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: null,
  status: 'loading',
  setSession: (accessToken, user) => set({ accessToken, user, status: 'authenticated' }),
  setToken: (accessToken) =>
    set((state) => ({
      accessToken,
      status: accessToken ? state.status : 'anonymous',
    })),
  setUser: (user) => set({ user, status: user ? 'authenticated' : 'anonymous' }),
  clear: () => set({ accessToken: null, user: null, status: 'anonymous' }),
}));

bindTokenStore(
  () => useAuthStore.getState().accessToken,
  (token) => useAuthStore.getState().setToken(token),
);
