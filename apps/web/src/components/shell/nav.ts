import type { ModuleKey } from '@nosion/contracts';
import {
  BarChart3,
  CalendarDays,
  CircleCheck,
  Dumbbell,
  LayoutGrid,
  Repeat,
  Settings,
  Sparkles,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

export type NavKey =
  | 'today'
  | 'tasks'
  | 'expenses'
  | 'workouts'
  | 'habits'
  | 'calendar'
  | 'review'
  | 'settings'
  | 'hub';

export interface NavItem {
  href: string;
  /** ชื่อที่แสดง = ข้อความ `nav.<key>` ตามภาษา (messages/*.json) */
  key: NavKey;
  /** ชื่ออังกฤษในวงเล็บบน sidebar (เฉพาะภาษาไทย) และหัวข้อย่อยบน header มือถือ (8.2) */
  en: string;
  icon: LucideIcon;
  /** false = หน้ายังไม่มี (แสดงเป็น "เร็ว ๆ นี้" แทนลิงก์เสีย) */
  ready: boolean;
  /** เมนูของโมดูลนี้ — ผู้ใช้ปิดโมดูลในการตั้งค่าแล้วเมนูถูกซ่อน */
  module?: ModuleKey;
}

/** เมนูหลักบน sidebar (desktop/tablet) — ตามลำดับใน 8.2 */
export const PRIMARY_NAV: readonly NavItem[] = [
  { href: '/today', key: 'today', en: 'Today', icon: Sparkles, ready: true },
  { href: '/tasks', key: 'tasks', en: 'Tasks', icon: CircleCheck, ready: true, module: 'task' },
  {
    href: '/expenses',
    key: 'expenses',
    en: 'Finance',
    icon: Wallet,
    ready: true,
    module: 'expense',
  },
  {
    href: '/workouts',
    key: 'workouts',
    en: 'Workouts',
    icon: Dumbbell,
    ready: false,
    module: 'workout',
  },
  { href: '/habits', key: 'habits', en: 'Habits', icon: Repeat, ready: true, module: 'habit' },
  { href: '/calendar', key: 'calendar', en: 'Calendar', icon: CalendarDays, ready: true },
  { href: '/review', key: 'review', en: 'Review', icon: BarChart3, ready: true },
];

export const SETTINGS_NAV: NavItem = {
  href: '/settings',
  key: 'settings',
  en: 'Settings',
  icon: Settings,
  ready: true,
};

export const HUB_NAV: NavItem = {
  href: '/hub',
  key: 'hub',
  en: 'More',
  icon: LayoutGrid,
  ready: true,
};

/**
 * Bottom tab bar มือถือ 5 ช่องคงที่ (8.2): วันนี้ · งาน · การเงิน · ปฏิทิน · สรุป
 * โมดูลที่เปิดน้อยกว่า (Workouts, Habits, Review, Settings) อยู่ในหน้า hub "สรุป"
 */
export const MOBILE_TABS: readonly NavItem[] = [
  PRIMARY_NAV[0]!,
  PRIMARY_NAV[1]!,
  PRIMARY_NAV[2]!,
  PRIMARY_NAV[5]!,
  HUB_NAV,
];

/** รายการในหน้า hub "สรุป" */
export const HUB_ITEMS: readonly NavItem[] = [
  PRIMARY_NAV[3]!,
  PRIMARY_NAV[4]!,
  PRIMARY_NAV[6]!,
  SETTINGS_NAV,
];

/**
 * เมนูที่แสดงได้ — ตัดเมนูของโมดูลที่ผู้ใช้ปิด · `enabled` ยังไม่รู้ (settings ยังไม่มา) = แสดงทั้งหมด
 * ปิดแค่ซ่อนเมนู: เปิด URL ตรงยังเข้าได้ และข้อมูลไม่หาย
 */
export function visibleNav(
  items: readonly NavItem[],
  enabled: readonly ModuleKey[] | undefined,
): NavItem[] {
  return items.filter((item) => !item.module || !enabled || enabled.includes(item.module));
}

const ALL = [...PRIMARY_NAV, SETTINGS_NAV, HUB_NAV];

export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** เมนูที่ตรงกับ path ปัจจุบัน — ใช้ทำหัวข้อย่อยบน header มือถือ */
export function currentNav(pathname: string): NavItem | undefined {
  return ALL.find((item) => isActive(pathname, item.href));
}

/** หน้าที่อยู่ใน hub ให้แท็บ "สรุป" ติด active ด้วย */
export function isInHub(pathname: string): boolean {
  return isActive(pathname, HUB_NAV.href) || HUB_ITEMS.some((i) => isActive(pathname, i.href));
}
