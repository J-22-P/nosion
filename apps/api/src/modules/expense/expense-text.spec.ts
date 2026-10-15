import { describe, expect, it } from 'vitest';
import { guessCategory, parseExpenseText } from './expense-text';

const TZ = 'Asia/Bangkok';
// 18 ก.ย. 2026 10:00 ตามเวลาไทย
const NOW = new Date('2026-09-18T03:00:00Z');

/** table-driven (สเปก 6.4) — เพิ่มเคสใหม่ได้ในบรรทัดเดียว */
const CASES: {
  input: string;
  title: string;
  amountMinor: number;
  category: string;
  direction?: 'expense' | 'income';
  isBill?: boolean;
}[] = [
  { input: 'กาแฟ 65', title: 'กาแฟ', amountMinor: 6500, category: 'food' },
  { input: 'ข้าวมันไก่ 50 บาท', title: 'ข้าวมันไก่', amountMinor: 5000, category: 'food' },
  { input: 'Grab 145.50', title: 'Grab', amountMinor: 14550, category: 'transport' },
  { input: 'ค่าน้ำมัน 1,200', title: 'ค่าน้ำมัน', amountMinor: 120000, category: 'transport' },
  { input: 'ค่าน้ำ 180', title: 'ค่าน้ำ', amountMinor: 18000, category: 'utilities' },
  {
    input: 'หนังสือ Clean Code 450',
    title: 'หนังสือ Clean Code',
    amountMinor: 45000,
    category: 'education',
  },
  { input: 'ดูหนัง 240', title: 'ดูหนัง', amountMinor: 24000, category: 'entertainment' },
  { input: 'Netflix 419 ฿', title: 'Netflix', amountMinor: 41900, category: 'subscription' },
  { input: 'ค่าเช่าห้อง 8500', title: 'ค่าเช่าห้อง', amountMinor: 850000, category: 'housing' },
  { input: 'ของขวัญแม่ 1500', title: 'ของขวัญแม่', amountMinor: 150000, category: 'other' },
  {
    input: 'เงินเดือน 45000',
    title: 'เงินเดือน',
    amountMinor: 4500000,
    category: 'other',
    direction: 'income',
  },
  {
    input: '+ ขายของมือสอง 300',
    title: 'ขายของมือสอง',
    amountMinor: 30000,
    category: 'other',
    direction: 'income',
  },
  {
    input: 'ค่าเน็ต 799 ทุกวันที่ 5',
    title: 'ค่าเน็ต',
    amountMinor: 79900,
    category: 'utilities',
    isBill: true,
  },
  {
    input: 'AWS 1250 ทุกเดือน',
    title: 'AWS',
    amountMinor: 125000,
    category: 'subscription',
    isBill: true,
  },
];

describe('parseExpenseText', () => {
  it.each(CASES)('"$input"', ({ input, direction = 'expense', isBill = false, ...expected }) => {
    const r = parseExpenseText(input, NOW, TZ);
    expect(r).not.toBeNull();
    expect(r).toMatchObject({ ...expected, direction, isBill });
  });

  it.each([
    'ประชุมทีม พรุ่งนี้',
    'อ่านหนังสือ',
    '65', // ตัวเลขอย่างเดียวไม่มีชื่อรายการ
    'ais5g', // ตัวเลขติดตัวอักษร ไม่ใช่จำนวนเงิน
    'กาแฟ 0',
    'กาแฟ 65.555',
  ])('"%s" → ไม่ใช่รายจ่าย', (input) => {
    expect(parseExpenseText(input, NOW, TZ)).toBeNull();
  });

  it('มีหน่วยเงิน + เจอหมวด → มั่นใจกว่าตัวเลขลอย ๆ', () => {
    const plain = parseExpenseText('ของขวัญ 100', NOW, TZ)!;
    const rich = parseExpenseText('กาแฟ 100 บาท', NOW, TZ)!;
    expect(rich.confidence).toBeGreaterThan(plain.confidence);
    expect(rich.matchedTokens).toEqual(['100 บาท', 'กาแฟ']);
  });

  it('ปริมาณเป็นส่วนของชื่อ · รายวันเป็นรายจ่ายซ้ำแต่ไม่ใช่บิล', () => {
    expect(parseExpenseText('ซื้อน้ำ 2 ขวด 30 บาท', NOW, TZ)?.title).toBe('ซื้อน้ำ 2 ขวด');
    const daily = parseExpenseText('ค่ารถ 40 ทุกวัน', NOW, TZ)!;
    expect(daily).toMatchObject({ isBill: false, rrule: 'FREQ=DAILY', dueAt: null });
  });

  it('บิล "ทุกวันที่ 5" ได้วันครบกำหนดถัดไป (วันที่ 5 เดือนหน้า เพราะเลยวันที่ 5 ของเดือนนี้แล้ว)', () => {
    const r = parseExpenseText('ค่าเน็ต 799 ทุกวันที่ 5', NOW, TZ)!;
    expect(r.dueAt?.toISOString()).toBe('2026-10-04T17:00:00.000Z'); // 5 ต.ค. 00:00 เวลาไทย
  });
});

describe('guessCategory', () => {
  it('คำที่ยาวที่สุดชนะ: "ค่าน้ำมัน" เป็นเดินทาง ไม่ใช่ค่าน้ำ · "หนังสือ" ไม่ใช่ดูหนัง', () => {
    expect(guessCategory('ค่าน้ำมันรถ').category).toBe('transport');
    expect(guessCategory('หนังสือ').category).toBe('education');
  });
});
