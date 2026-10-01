import { describe, expect, it } from 'vitest';
import { budgetTone, createBudgetSchema, periodQuerySchema } from './expenses';

describe('budgetTone (สเปก 8.7.5)', () => {
  it.each([
    [0, 1000, 'safe'],
    [849, 1000, 'safe'],
    [850, 1000, 'warning'], // 85% พอดี = เตือน
    [999, 1000, 'warning'],
    [1000, 1000, 'over'], // 100% พอดี = เกิน
    [1500, 1000, 'over'],
  ] as const)('%i / %i → %s', (spent, limit, tone) => {
    expect(budgetTone(spent, limit)).toBe(tone);
  });

  it('ไม่มีงบ หรืองบ 0 → safe (ไม่หารด้วยศูนย์)', () => {
    expect(budgetTone(500, null)).toBe('safe');
    expect(budgetTone(500, 0)).toBe('safe');
  });
});

describe('createBudgetSchema', () => {
  it('ไม่ส่ง category = งบรวม · threshold เริ่มต้น 80', () => {
    expect(createBudgetSchema.parse({ amountMinor: 1500000 })).toEqual({
      category: null,
      amountMinor: 1500000,
      alertThreshold: 80,
    });
  });

  it('ปฏิเสธเงินทศนิยม ติดลบ และหมวดที่ไม่มี', () => {
    expect(createBudgetSchema.safeParse({ amountMinor: 10.5 }).success).toBe(false);
    expect(createBudgetSchema.safeParse({ amountMinor: -1 }).success).toBe(false);
    expect(createBudgetSchema.safeParse({ amountMinor: 1, category: 'pets' }).success).toBe(false);
  });
});

describe('periodQuerySchema', () => {
  it('รับ YYYY-MM เดือน 01–12 เท่านั้น', () => {
    expect(periodQuerySchema.safeParse({ period: '2026-09' }).success).toBe(true);
    expect(periodQuerySchema.safeParse({}).success).toBe(true);
    expect(periodQuerySchema.safeParse({ period: '2026-13' }).success).toBe(false);
    expect(periodQuerySchema.safeParse({ period: '2026-9' }).success).toBe(false);
  });
});
