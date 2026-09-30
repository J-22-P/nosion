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

export interface NavItem {
  href: string;
  /** ชื่อไทยที่แสดงเป็นหลัก */
  label: string;
  /** ชื่ออังกฤษในวงเล็บบน sidebar และหัวข้อย่อยบน header มือถือ (8.2) */
  en: string;
  icon: LucideIcon;
  /** false = หน้ายังไม่มี (แสดงเป็น "เร็ว ๆ นี้" แทนลิงก์เสีย) */
  ready: boolean;
}

/** เมนูหลักบน sidebar (desktop/tablet) — ตามลำดับใน 8.2 */
export const PRIMARY_NAV: readonly NavItem[] = [
  { href: '/today', label: 'วันนี้', en: 'Today', icon: Sparkles, ready: true },
  { href: '/tasks', label: 'งาน', en: 'Tasks', icon: CircleCheck, ready: true },
  { href: '/expenses', label: 'การเงิน', en: 'Finance', icon: Wallet, ready: false },
  { href: '/workouts', label: 'ออกกำลังกาย', en: 'Workouts', icon: Dumbbell, ready: false },
  { href: '/habits', label: 'นิสัย', en: 'Habits', icon: Repeat, ready: false },
  { href: '/calendar', label: 'ปฏิทิน', en: 'Calendar', icon: CalendarDays, ready: false },
  { href: '/review', label: 'สรุปสัปดาห์', en: 'Review', icon: BarChart3, ready: false },
];

export const SETTINGS_NAV: NavItem = {
  href: '/settings',
  label: 'ตั้งค่า',
  en: 'Settings',
  icon: Settings,
  ready: true,
};

export const HUB_NAV: NavItem = {
  href: '/hub',
  label: 'สรุป',
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
