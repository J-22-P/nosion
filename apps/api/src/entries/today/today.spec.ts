import { describe, expect, it } from 'vitest';
import { greetingFor, localHour, toWidgetDto } from './today';

describe('greetingFor (สเปก 8.11.1: เช้า < 12:00 ≤ บ่าย < 18:00 ≤ เย็น)', () => {
  it.each([
    ['2026-09-18T04:59:00Z', 'สวัสดีตอนเช้า Jay'], // 11:59 เวลาไทย
    ['2026-09-18T05:00:00Z', 'สวัสดีตอนบ่าย Jay'], // 12:00
    ['2026-09-18T10:59:00Z', 'สวัสดีตอนบ่าย Jay'], // 17:59
    ['2026-09-18T11:00:00Z', 'สวัสดีตอนเย็น Jay'], // 18:00
    ['2026-09-17T17:30:00Z', 'สวัสดีตอนเช้า Jay'], // 00:30 วันถัดไป
  ])('%s → %s', (iso, text) => {
    expect(greetingFor(new Date(iso), 'Asia/Bangkok', 'Jay')).toBe(text);
  });

  it('ใช้เวลาตามโซนผู้ใช้ ไม่ใช่โซนของเซิร์ฟเวอร์', () => {
    const at = new Date('2026-09-18T03:00:00Z');
    expect(localHour(at, 'Asia/Bangkok')).toBe(10);
    expect(localHour(at, 'America/New_York')).toBe(23);
  });
});

describe('toWidgetDto', () => {
  it('Date ใน items เป็น ISO string · null คงเป็น null', () => {
    const dto = toWidgetDto({
      module: 'task',
      title: 'งาน',
      order: 1,
      headline: '',
      isEmpty: false,
      items: [
        {
          entryId: 'a',
          title: 'a',
          status: 'pending',
          occurredAt: new Date('2026-09-18T03:00:00Z'),
        },
        { entryId: 'b', title: 'b', status: 'pending', occurredAt: null },
      ],
    });
    expect(dto.items.map((i) => i.occurredAt)).toEqual(['2026-09-18T03:00:00.000Z', null]);
  });
});
