import { describe, expect, it } from 'vitest';
import { HUB_ITEMS, MOBILE_TABS, PRIMARY_NAV, visibleNav } from './nav';

const keys = (items: { key: string }[]) => items.map((i) => i.key);

describe('visibleNav', () => {
  it('ซ่อนเมนูของโมดูลที่ปิด · เมนูที่ไม่ผูกโมดูล (วันนี้ ปฏิทิน สรุป) แสดงเสมอ', () => {
    expect(keys(visibleNav(PRIMARY_NAV, ['task', 'habit']))).toEqual([
      'today',
      'tasks',
      'habits',
      'calendar',
      'review',
    ]);
    expect(keys(visibleNav(MOBILE_TABS, ['habit']))).toEqual(['today', 'calendar', 'hub']);
    expect(keys(visibleNav(HUB_ITEMS, ['task']))).toEqual(['review', 'settings']);
  });

  it('ยังไม่รู้ว่าเปิดโมดูลอะไร (settings ยังโหลดไม่เสร็จ) → แสดงทั้งหมด', () => {
    expect(visibleNav(PRIMARY_NAV, undefined)).toHaveLength(PRIMARY_NAV.length);
  });
});
