import { describe, expect, it } from 'vitest';
import { desktopSpan } from './layout';

describe('desktopSpan', () => {
  const spans = (count: number) => Array.from({ length: count }, (_, i) => desktopSpan(i, count));

  it('4 การ์ด: 7/5 แล้ว 5/7 (ตาม mockup)', () => {
    expect(spans(4)).toEqual([7, 5, 5, 7]);
  });

  it('ทุกแถวรวมได้ 12 เสมอ — ปิดโมดูลจนเหลือจำนวนคี่ การ์ดสุดท้ายเต็มแถว', () => {
    expect(spans(2)).toEqual([7, 5]);
    expect(spans(3)).toEqual([7, 5, 12]);
    expect(spans(1)).toEqual([12]);
    expect(spans(5)).toEqual([7, 5, 5, 7, 12]);
  });
});
