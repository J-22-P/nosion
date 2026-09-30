import type { ModuleKey } from '@nosion/contracts';

/**
 * ตัวตนของโมดูลบน UI (สเปก 8.7.2 v1.1)
 *
 * v1.1 ตัดสีรุ้งประจำโมดูลออก — บอกด้วย "ไอคอน + prefix" แทน สีอ่านจาก token
 * `--module-*` เสมอ (ไม่ hard-code hex) เพื่อให้เปลี่ยนตามธีม dark/light ได้เอง
 * `icon` เป็นชื่อไอคอนของ lucide แบบ kebab-case — ฝั่ง web แปลงเป็น component เอง
 */
export const MODULE_THEME: Record<
  ModuleKey,
  { cssVar: string; icon: string; prefix: string; label: string }
> = {
  task: { cssVar: 'var(--module-task)', icon: 'circle-check', prefix: 'T:', label: 'งาน' },
  expense: { cssVar: 'var(--module-expense)', icon: 'wallet', prefix: 'E:', label: 'การเงิน' },
  workout: {
    cssVar: 'var(--module-workout)',
    icon: 'dumbbell',
    prefix: 'W:',
    label: 'ออกกำลังกาย',
  },
  habit: { cssVar: 'var(--module-habit)', icon: 'repeat', prefix: 'H:', label: 'นิสัย' },
};
