import { describe, expect, it } from 'vitest';
import { currencyDigits, formatMoney, parseAmountToMinor } from './money';

describe('parseAmountToMinor', () => {
  it.each([
    ['65', 6500],
    ['65.5', 6550],
    ['65.50', 6550],
    ['0.1', 10],
    ['1,250.75', 125075],
    ['1250', 125000],
  ])('"%s" → %i สตางค์', (text, minor) => {
    expect(parseAmountToMinor(text)).toBe(minor);
  });

  it.each(['', 'abc', '65.555', '1,25', '-5', '6 5'])('"%s" → null', (text) => {
    expect(parseAmountToMinor(text)).toBeNull();
  });

  it('ไม่ผ่าน float: 0.1 + 0.2 ในหน่วยย่อยได้ 30 พอดี', () => {
    expect(parseAmountToMinor('0.1')! + parseAmountToMinor('0.2')!).toBe(30);
  });

  it('สกุลที่ไม่มีทศนิยม (JPY) ไม่ยอมรับทศนิยม', () => {
    expect(currencyDigits('JPY')).toBe(0);
    expect(parseAmountToMinor('500', 'JPY')).toBe(500);
    expect(parseAmountToMinor('500.5', 'JPY')).toBeNull();
  });
});

describe('formatMoney', () => {
  it('ตาราง/บิล: ทศนิยม 2 ตำแหน่ง · KPI: ไม่มีทศนิยม', () => {
    expect(formatMoney(79900)).toBe('฿799.00');
    expect(formatMoney(842000, 'THB', { decimals: false })).toBe('฿8,420');
  });

  it('ติดลบ (รายจ่ายในตาราง)', () => {
    expect(formatMoney(-14500)).toBe('-฿145.00');
  });
});
