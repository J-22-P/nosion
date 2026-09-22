import type { ModuleKey } from '@nosion/contracts';

/** สี/ไอคอนประจำโมดูล — อ่านจาก token เดียวกับ CSS เพื่อไม่ให้ค่าหลุดจากกัน */
export const MODULE_THEME: Record<
  ModuleKey,
  { color: string; cssVar: string; icon: string; label: string }
> = {
  task: { color: '#6366f1', cssVar: 'var(--module-task)', icon: 'check-square', label: 'งาน' },
  expense: { color: '#10b981', cssVar: 'var(--module-expense)', icon: 'wallet', label: 'การเงิน' },
  workout: {
    color: '#f59e0b',
    cssVar: 'var(--module-workout)',
    icon: 'dumbbell',
    label: 'ออกกำลังกาย',
  },
  habit: { color: '#8b5cf6', cssVar: 'var(--module-habit)', icon: 'repeat', label: 'นิสัย' },
};
