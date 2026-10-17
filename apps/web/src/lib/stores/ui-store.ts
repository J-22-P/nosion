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
  /** หน้าต่างปุ่มลัด "?" (สเปก 8.4) */
  shortcutsOpen: boolean;
  setShortcutsOpen: (open: boolean) => void;
  /** id ของงานที่เปิดหน้าต่างรายละเอียดอยู่ — เปิดได้จาก Tasks / Today / Calendar */
  taskDetailId: string | null;
  openTaskDetail: (id: string | null) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
      paletteOpen: false,
      setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
      shortcutsOpen: false,
      setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
      taskDetailId: null,
      openTaskDetail: (taskDetailId) => set({ taskDetailId }),
    }),
    {
      name: 'nosion:ui',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ sidebarCollapsed: s.sidebarCollapsed }),
    },
  ),
);
