import type { ExpenseCategory } from '@nosion/contracts';
import { parseAmountToMinor, parseNaturalText, remainingText, type NlResult } from '@nosion/core';

/**
 * คำที่บอกหมวด — จับแบบ "คำที่ยาวที่สุดชนะ" ไม่ใช่ "เจอก่อนชนะ"
 * เพราะ "ค่าน้ำมัน" มี "ค่าน้ำ" อยู่ข้างใน ถ้าเรียงผิดลำดับ น้ำมันรถจะกลายเป็นค่าน้ำประปา
 */
const CATEGORY_KEYWORDS: Record<Exclude<ExpenseCategory, 'other'>, string[]> = {
  food: [
    'กาแฟ',
    'ข้าว',
    'อาหาร',
    'ก๋วยเตี๋ยว',
    'ชาไข่มุก',
    'ชานม',
    'ขนม',
    'ชาบู',
    'หมูกระทะ',
    'มื้อ',
    'coffee',
    'lunch',
    'dinner',
    'food',
    'cafe',
  ],
  transport: [
    'ค่าน้ำมัน',
    'น้ำมัน',
    'แท็กซี่',
    'taxi',
    'grab',
    'bolt',
    'bts',
    'mrt',
    'รถไฟฟ้า',
    'ทางด่วน',
    'วินมอไซค์',
    'ค่ารถ',
  ],
  housing: ['ค่าเช่า', 'ค่าห้อง', 'ค่าคอนโด', 'ค่าส่วนกลาง', 'rent'],
  utilities: [
    'ค่าน้ำ',
    'ค่าไฟ',
    'ค่าเน็ต',
    'อินเทอร์เน็ต',
    'internet',
    'fibre',
    'ค่าโทรศัพท์',
    'ค่าโทร',
    'ais',
    'true',
    'dtac',
  ],
  health: ['ยา', 'หมอ', 'โรงพยาบาล', 'คลินิก', 'ทำฟัน', 'ฟิตเนส', 'gym'],
  entertainment: ['หนัง', 'ดูหนัง', 'คอนเสิร์ต', 'เกม', 'game', 'cinema'],
  shopping: ['shopee', 'lazada', 'เสื้อ', 'รองเท้า', 'ช้อป', 'ของใช้'],
  education: ['หนังสือ', 'คอร์ส', 'course', 'udemy', 'ค่าเรียน'],
  subscription: [
    'netflix',
    'spotify',
    'youtube',
    'icloud',
    'github',
    'copilot',
    'aws',
    'chatgpt',
    'claude',
    'subscription',
  ],
  debt: ['ผ่อน', 'หนี้', 'บัตรเครดิต', 'loan'],
  savings: ['ออม', 'เก็บเงิน', 'ลงทุน', 'กองทุน'],
};

const INCOME_HINTS = /^\+|เงินเดือน|รายรับ|ได้เงิน|โบนัส|salary|income/i;

/** รอบรายเดือน/รายปี = บิล (ขึ้นปฏิทิน + การ์ดบิลประจำ) · รายวัน/สัปดาห์ = รายจ่ายซ้ำธรรมดา */
const BILL_FREQ = /^FREQ=(MONTHLY|YEARLY)\b/;

export interface ParsedExpenseText {
  title: string;
  amountMinor: number;
  direction: 'expense' | 'income';
  category: ExpenseCategory;
  isBill: boolean;
  /** วันครบกำหนดของบิล = รอบแรกของกฎ (ต้นวันตามโซนผู้ใช้) · null = ไม่ใช่บิล */
  dueAt: Date | null;
  /** วันที่ผู้ใช้ระบุ ("เมื่อวาน") · null = ไม่ระบุ */
  occurredAt: Date | null;
  rrule: string | null;
  confidence: number;
  matchedTokens: string[];
}

/** เดาหมวดจากคำที่ยาวที่สุดที่เจอ */
export function guessCategory(text: string): { category: ExpenseCategory; keyword: string | null } {
  const lower = text.toLowerCase();
  let best: { category: ExpenseCategory; keyword: string | null } = {
    category: 'other',
    keyword: null,
  };
  for (const [category, words] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const word of words) {
      if (lower.includes(word) && word.length > (best.keyword?.length ?? 0)) {
        best = { category: category as ExpenseCategory, keyword: word };
      }
    }
  }
  return best;
}

/**
 * ตีความผลของ parser กลางเป็นรายจ่าย (สเปก 6.4) — pure function ไม่แตะฐานข้อมูล
 * ไม่มีจำนวนเงิน / ไม่มีชื่อรายการ = ไม่ใช่รายจ่าย → null (ให้โมดูลอื่นลอง)
 */
export function interpretExpense(nl: NlResult, currency = 'THB'): ParsedExpenseText | null {
  const amount = nl.tokens.find((t) => t.kind === 'amount');
  if (!amount || amount.kind !== 'amount') return null;
  const amountMinor = parseAmountToMinor(amount.value, currency);
  if (amountMinor === null || amountMinor === 0) return null;

  // "ซื้อ 2 ขวด 50 บาท" ชื่อ "ซื้อ 2 ขวด" — ปริมาณ/ระยะเวลาเป็นส่วนหนึ่งของชื่อ ไม่ใช่ข้อมูลของรายจ่าย
  const title = remainingText(nl, ['quantity', 'duration'])
    .replace(/^\+\s*/, '')
    .trim();
  if (!title) return null;

  const matchedTokens = [amount.raw];
  let confidence = 0.6;
  if (amount.hasCurrency) confidence += 0.1;

  const { category, keyword } = guessCategory(title);
  if (keyword) {
    confidence += 0.2;
    matchedTokens.push(keyword);
  }

  const recurrence = nl.tokens.find((t) => t.kind === 'recurrence');
  if (recurrence) {
    confidence += 0.1;
    matchedTokens.push(recurrence.raw);
  }
  const isBill = nl.rrule !== null && BILL_FREQ.test(nl.rrule);

  return {
    title,
    amountMinor,
    direction: amount.income || INCOME_HINTS.test(nl.input.trim()) ? 'income' : 'expense',
    category,
    isBill,
    dueAt: isBill ? nl.occurredAt : null,
    occurredAt: nl.date ? nl.occurredAt : null,
    rrule: nl.rrule,
    confidence: Math.min(confidence, 0.95),
    matchedTokens,
  };
}

/** ทางลัดสำหรับเทสต์และโค้ดที่มีแค่ข้อความ */
export function parseExpenseText(
  input: string,
  now: Date,
  timeZone: string,
  currency = 'THB',
): ParsedExpenseText | null {
  return interpretExpense(parseNaturalText(input, { now, timeZone }), currency);
}
