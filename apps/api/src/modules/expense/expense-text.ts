import type { ExpenseCategory } from '@nosion/contracts';
import { formatInTimeZone, parseAmountToMinor, zonedTimeToUtc } from '@nosion/core';

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

/** "ชื่อ ตัวเลข [บาท|฿|thb] [ส่วนท้าย]" — ตัวเลขต้องลอยเป็นคำ ไม่ติดกับตัวอักษร (กัน "ais5g") */
const AMOUNT_PATTERN =
  /^(?<title>.+?)\s+฿?\s*(?<amount>\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)\s*(?<unit>บาท|฿|thb)?(?:\s+(?<rest>.*))?$/i;

/** "ทุกวันที่ 5" · "ทุกเดือน" — Phase 3 จะแปลงเป็น rrule จริง ตอนนี้ใช้ตั้ง isBill + วันครบกำหนด */
const BILL_PATTERN = /ทุกวันที่\s*(?<day>\d{1,2})|ทุกเดือน|monthly/i;

export interface ParsedExpenseText {
  title: string;
  amountMinor: number;
  direction: 'expense' | 'income';
  category: ExpenseCategory;
  isBill: boolean;
  /** วันครบกำหนดของบิล (ต้นวันตามโซนผู้ใช้) · null = ไม่ใช่บิลหรือไม่ระบุวัน */
  dueAt: Date | null;
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
 * วันครบกำหนดถัดไปของ "ทุกวันที่ N" นับจากวันนี้ (รวมวันนี้)
 * เดือนที่ไม่มีวันที่ N (เช่น 31 ใน ก.พ.) → วันสุดท้ายของเดือน
 */
export function nextDueDate(dayOfMonth: number, now: Date, timeZone: string): Date {
  const [y, m, d] = formatInTimeZone(now, timeZone).split('-').map(Number) as [
    number,
    number,
    number,
  ];
  const clamp = (year: number, month: number) =>
    Math.min(dayOfMonth, new Date(Date.UTC(year, month, 0)).getUTCDate());
  let year = y;
  let month = m;
  if (clamp(year, month) < d) {
    month = m === 12 ? 1 : m + 1;
    year = m === 12 ? y + 1 : y;
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return zonedTimeToUtc(`${year}-${pad(month)}-${pad(clamp(year, month))}T00:00:00`, timeZone);
}

/**
 * แปลงข้อความสั้นแบบ "กาแฟ 65" เป็นรายจ่าย (สเปก 6.4) — pure function ไม่แตะฐานข้อมูล
 * ไม่มีจำนวนเงิน = ไม่ใช่รายจ่าย → null (ให้โมดูลอื่นลอง)
 */
export function parseExpenseText(
  input: string,
  now: Date,
  timeZone: string,
  currency = 'THB',
): ParsedExpenseText | null {
  const m = AMOUNT_PATTERN.exec(input.trim());
  if (!m?.groups) return null;
  const amountMinor = parseAmountToMinor(m.groups.amount!, currency);
  if (amountMinor === null || amountMinor === 0) return null;

  const title = m.groups.title!.replace(/^\+\s*/, '').trim();
  const rest = m.groups.rest ?? '';
  const matchedTokens = [m.groups.amount!];
  let confidence = 0.6;
  if (m.groups.unit) {
    confidence += 0.1;
    matchedTokens.push(m.groups.unit);
  }

  const { category, keyword } = guessCategory(title);
  if (keyword) {
    confidence += 0.2;
    matchedTokens.push(keyword);
  }

  const bill = BILL_PATTERN.exec(rest);
  let dueAt: Date | null = null;
  if (bill) {
    confidence += 0.1;
    matchedTokens.push(bill[0]);
    const day = bill.groups?.day ? Number(bill.groups.day) : null;
    if (day !== null && day >= 1 && day <= 31) dueAt = nextDueDate(day, now, timeZone);
  }

  return {
    title,
    amountMinor,
    direction: INCOME_HINTS.test(input) ? 'income' : 'expense',
    category,
    isBill: bill !== null,
    dueAt,
    confidence: Math.min(confidence, 0.95),
    matchedTokens,
  };
}
