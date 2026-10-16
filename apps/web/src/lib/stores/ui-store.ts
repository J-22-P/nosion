'use client';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/**
 * UI state ที่ไม่ต้องซิงก์กับ server (สเปก 8.5)
 * sidebar ยุบ/ขยายจำไว้ใน localStorage (8.2) — ค่าอื่น (⌘K open ฯลฯ) ไม่ persist (ดู partialize)
 */
interface UIState {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  /** Command palette ⌘K (สเปก 8.3) — ไม่ persist: รีเฟรชแล้วปิดเสมอ */
  paletteOpen: boolean;
  setPaletteOpen: (open: boolean) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
      paletteOpen: false,
      setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
    }),
    {
      name: 'nosion:ui',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ sidebarCollapsed: s.sidebarCollapsed }),
    },
  ),
);
