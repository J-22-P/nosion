import type { CategoryAmountDto, ExpenseCategory } from '@nosion/contracts';
import { describe, expect, it } from 'vitest';
import { foldCategories, niceMax } from './analytics-data';

const row = (category: ExpenseCategory, amountMinor: number): CategoryAmountDto => ({
  category,
  amountMinor,
  count: 1,
  share: 0,
});

describe('foldCategories', () => {
  it('ไม่เกิน 6 หมวด → แสดงครบ เรียงมากไปน้อย ตัดหมวดที่เป็นศูนย์', () => {
    const s = foldCategories([row('food', 100), row('housing', 300), row('health', 0)]);
    expect(s.map((x) => x.key)).toEqual(['housing', 'food']);
    expect(s.map((x) => x.share)).toEqual([0.75, 0.25]);
  });

  it('เกิน 6 → 5 อันดับแรก + "อื่น ๆ" (หมวด other เดิมถูกพับรวมเสมอ) · สัดส่วนรวม = 1', () => {
    const s = foldCategories([
      row('food', 900),
      row('other', 800),
      row('housing', 700),
      row('transport', 600),
      row('health', 500),
      row('education', 400),
      row('shopping', 100),
    ]);
    expect(s.map((x) => x.key)).toEqual([
      'food',
      'housing',
      'transport',
      'health',
      'education',
      'rest',
    ]);
    expect(s.at(-1)).toMatchObject({ amountMinor: 900, folded: ['other', 'shopping'] });
    expect(s.reduce((a, x) => a + x.share, 0)).toBeCloseTo(1, 10);
  });
});

describe('niceMax', () => {
  it.each([
    [842000, 1000000],
    [1340000, 2000000],
    [2100000, 2500000],
    [4500000, 5000000],
    [0, 1],
  ])('%i → %i', (v, max) => expect(niceMax(v)).toBe(max));
});
