import { describe, expect, it } from 'vitest';
import { dateTimeFormat, numberFormat } from './intl';

describe('Intl formatter แบบแคช', () => {
  it('locale + options เดียวกัน → ตัวเดิม (ไม่สร้างใหม่ทุกครั้ง)', () => {
    expect(dateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' })).toBe(
      dateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }),
    );
    expect(numberFormat('th-TH', { style: 'currency', currency: 'THB' })).toBe(
      numberFormat('th-TH', { style: 'currency', currency: 'THB' }),
    );
  });

  it('options ต่างกัน → คนละตัว และผลถูกตามโซน', () => {
    const at = new Date('2026-10-17T20:00:00Z');
    expect(dateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(at)).toBe('2026-10-18');
    expect(dateTimeFormat('en-CA', { timeZone: 'UTC' }).format(at)).toBe('2026-10-17');
  });
});
