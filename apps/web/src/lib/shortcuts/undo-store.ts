'use client';

import { create } from 'zustand';

/**
 * ⌘Z "undo การกระทำล่าสุด" (สเปก 8.4) — stack ของการย้อนกลับในหน่วยความจำ (รีเฟรชแล้วหาย โดยตั้งใจ)
 * ผู้กระทำลงทะเบียนวิธีย้อนเองตอนทำสำเร็จ (ติ๊กเสร็จ → เปิดกลับ · เลื่อน → ย้ายกลับ · ลบ → กู้คืน)
 * เพราะมีแต่ผู้กระทำที่รู้ค่าเดิมและ version ล่าสุดของ entry
 */
export interface UndoItem {
  /** "เสร็จ: ส่งรายงาน" — แสดงใน toast ตอนย้อน */
  label: string;
  run: () => Promise<unknown>;
}

const MAX = 20;

interface UndoState {
  stack: UndoItem[];
  push: (item: UndoItem) => void;
  pop: () => UndoItem | undefined;
}

export const useUndoStore = create<UndoState>()((set, get) => ({
  stack: [],
  push: (item) => set((s) => ({ stack: [...s.stack, item].slice(-MAX) })),
  pop: () => {
    const item = get().stack.at(-1);
    if (item) set((s) => ({ stack: s.stack.slice(0, -1) }));
    return item;
  },
}));

export const pushUndo = (item: UndoItem) => useUndoStore.getState().push(item);
