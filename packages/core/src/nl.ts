/**
 * Natural Language Parser กลาง (สเปก 6.4) — ไทย + อังกฤษ · rule-based ไม่ใช้ LLM
 *
 * แยก "ข้อความสั้น" เป็นชิ้นส่วนที่ทุกโมดูลใช้ร่วมกัน: วันที่ เวลา การเกิดซ้ำ (RRULE) priority แท็ก โปรเจกต์
 * จำนวนเงิน ระยะเวลา และปริมาณพร้อมหน่วย — ส่วนที่เหลือคือชื่อรายการ
 * ไฟล์นี้ **ไม่รู้จักโมดูลใดเลย** โมดูลเอาผลไปตัดสินเองว่า "ใช่ของฉันไหม มั่นใจแค่ไหน"
 *
 * ใช้ได้ทั้ง server และเบราว์เซอร์ (subpath `@nosion/core/nl` ไม่แตะ Node, ไม่ import rrule)
 * → ⌘K แสดง preview จากโค้ดชุดเดียวกับที่ API ใช้ตัดสินจริง
 *
 * หลักการทำงาน: ไล่ matcher ตามลำดับ (การเกิดซ้ำ → วันที่ → เวลา → สัญลักษณ์ → ตัวเลข)
 * ส่วนที่ match แล้วถูก "ปิดทับ" ด้วยช่องว่างใน `masked` (ความยาวเท่าเดิม) ตัวถัดไปจึงไม่หยิบซ้ำ
 * และตำแหน่ง start/end ของ token ชี้กลับไปที่ข้อความเดิมได้ตรง ๆ (ใช้ highlight ใน UI)
 */
import type { Priority } from '@nosion/contracts';
import { formatInTimeZone, zonedTimeToUtc } from './time';
import { dateTimeFormat } from './intl';

export type NlPriority = Exclude<Priority, 'none'>;

export interface NlContext {
  /** "ตอนนี้" — รับเข้ามาเสมอ ไม่อ่านนาฬิกาเอง */
  now: Date;
  /** IANA timezone ของผู้ใช้ — "พรุ่งนี้" คือพรุ่งนี้ของผู้ใช้ ไม่ใช่ของ server */
  timeZone: string;
  /** 0 = อาทิตย์, 1 = จันทร์ (ค่าเริ่มต้น) — ใช้ตัดสิน "สัปดาห์หน้า" และ "ศุกร์หน้า" */
  weekStartsOn?: number;
}

interface TokenSpan {
  /** ข้อความเดิมตรงตำแหน่งนั้น */
  raw: string;
  start: number;
  end: number;
}

export type NlToken = TokenSpan &
  (
    | { kind: 'date'; value: string }
    | { kind: 'time'; value: string }
    | { kind: 'recurrence'; rrule: string }
    | { kind: 'priority'; value: NlPriority }
    | { kind: 'tag'; value: string }
    | { kind: 'project'; value: string }
    | { kind: 'amount'; value: string; hasCurrency: boolean; income: boolean }
    | { kind: 'duration'; minutes: number }
    | { kind: 'quantity'; value: number; unit: string }
  );

type TokenBody = NlToken extends infer T
  ? T extends NlToken
    ? Omit<T, keyof TokenSpan>
    : never
  : never;

export interface NlResult {
  input: string;
  /** ข้อความที่เหลือหลังตัด token ออก */
  title: string;
  /** วันตามปฏิทินของผู้ใช้ 'YYYY-MM-DD' — ระบุเอง หรือได้จากรอบแรกของการเกิดซ้ำ / เวลาที่ระบุ */
  date: string | null;
  /** 'HH:mm' ตามหน้าปัดของผู้ใช้ */
  time: string | null;
  /** date + time เป็น UTC · ไม่มีเวลา = เที่ยงคืนของวันนั้นตามโซนผู้ใช้ */
  occurredAt: Date | null;
  isAllDay: boolean;
  /** RRULE body เช่น "FREQ=MONTHLY;BYMONTHDAY=5" — ใช้กับ startsAt = occurredAt */
  rrule: string | null;
  priority: NlPriority | null;
  tags: string[];
  project: string | null;
  /** ตัวเลขตามที่พิมพ์ (อาจมี comma) — แปลงเป็นหน่วยย่อยด้วย parseAmountToMinor ตามสกุลเงินของผู้ใช้ */
  amount: string | null;
  /** ขึ้นต้นด้วย "+" = รายรับ */
  income: boolean;
  durationMinutes: number | null;
  quantities: { value: number; unit: string }[];
  /** เรียงตามตำแหน่งในข้อความ */
  tokens: NlToken[];
}

// ─── วันที่แบบ 'YYYY-MM-DD' (คำนวณด้วย UTC ล้วน — เป็นแค่วันบนปฏิทิน ไม่ใช่จุดเวลา) ───

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const partsOf = (s: string) => s.split('-').map(Number) as [number, number, number];
const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const weekdayOf = (s: string) => new Date(`${s}T00:00:00Z`).getUTCDay();

function addDays(s: string, n: number): string {
  const d = new Date(`${s}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** วันที่ `day` ของเดือน ที่ตรงหรือหลัง `from` · เดือนที่ไม่มีวันนั้น → วันสุดท้ายของเดือน (ADR-010) */
function nextMonthDay(from: string, day: number): string {
  const [y, m, d] = partsOf(from);
  const clamped = (yy: number, mm: number) => Math.min(day, daysInMonth(yy, mm));
  if (clamped(y, m) >= d) return ymd(y, m, clamped(y, m));
  const [ny, nm] = m === 12 ? [y + 1, 1] : [y, m + 1];
  return ymd(ny, nm, clamped(ny, nm));
}

/** วันในสัปดาห์ที่กำหนด ที่ตรงหรือหลัง `from` (วันนี้นับด้วย) */
function nextWeekday(from: string, weekday: number): string {
  return addDays(from, (weekday - weekdayOf(from) + 7) % 7);
}

function startOfWeek(s: string, weekStartsOn: number): string {
  return addDays(s, -((weekdayOf(s) - weekStartsOn + 7) % 7));
}

// ─── คำศัพท์ ───

const TH_DIGITS = /[๐-๙]/g;

/** ชื่อวัน → 0–6 · "อาทิตย์" แยกกฎไว้ เพราะไม่มีคำว่า "วัน" นำหน้ามักหมายถึง "สัปดาห์" */
const TH_WEEKDAYS: Record<string, number> = {
  อาทิตย์: 0,
  จันทร์: 1,
  อังคาร: 2,
  พุธ: 3,
  พฤหัสบดี: 4,
  พฤหัส: 4,
  ศุกร์: 5,
  เสาร์: 6,
};
const EN_WEEKDAYS: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};
const RRULE_DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const;

const TH_MONTHS: [string, number][] = [
  ['มกราคม', 1],
  ['ม.ค.', 1],
  ['กุมภาพันธ์', 2],
  ['ก.พ.', 2],
  ['มีนาคม', 3],
  ['มี.ค.', 3],
  ['เมษายน', 4],
  ['เม.ย.', 4],
  ['พฤษภาคม', 5],
  ['พ.ค.', 5],
  ['มิถุนายน', 6],
  ['มิ.ย.', 6],
  ['กรกฎาคม', 7],
  ['ก.ค.', 7],
  ['สิงหาคม', 8],
  ['ส.ค.', 8],
  ['กันยายน', 9],
  ['ก.ย.', 9],
  ['ตุลาคม', 10],
  ['ต.ค.', 10],
  ['พฤศจิกายน', 11],
  ['พ.ย.', 11],
  ['ธันวาคม', 12],
  ['ธ.ค.', 12],
];
const EN_MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];

const PRIORITY_ALIASES: Record<string, NlPriority> = {
  urgent: 'urgent',
  high: 'high',
  medium: 'medium',
  med: 'medium',
  low: 'low',
  ด่วน: 'urgent',
  สูง: 'high',
  กลาง: 'medium',
  ต่ำ: 'low',
};
/** ! = medium · !! = high · !!! = urgent */
const BANG_PRIORITY: NlPriority[] = ['medium', 'high', 'urgent'];

/** หน่วยที่ทำให้ตัวเลขไม่ใช่จำนวนเงิน — นาที/ชั่วโมงเป็น duration ที่เหลือเป็น quantity */
const DURATION_UNITS: Record<string, number> = {
  นาที: 1,
  min: 1,
  mins: 1,
  minute: 1,
  minutes: 1,
  ชั่วโมง: 60,
  'ชม.': 60,
  ชม: 60,
  h: 60,
  hr: 60,
  hrs: 60,
  hour: 60,
  hours: 60,
};
const QUANTITY_UNITS = [
  'km',
  'กม.',
  'กม',
  'กิโลเมตร',
  'กิโล',
  'kg',
  'กก.',
  'กก',
  'เมตร',
  'ลิตร',
  'ml',
  'l',
  'แก้ว',
  'ขวด',
  'ครั้ง',
  'รอบ',
  'เซ็ต',
  'set',
  'sets',
  'rep',
  'reps',
  'ก้าว',
  'steps',
  'หน้า',
  'ข้อ',
  'x',
];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** alternation ที่คำยาวกว่ามาก่อน — "พฤหัสบดี" ต้องชนะ "พฤหัส" */
const alt = (words: string[]) =>
  [...words]
    .sort((a, b) => b.length - a.length)
    .map(escape)
    .join('|');

const TH_DAY = alt(Object.keys(TH_WEEKDAYS));
const EN_DAY = alt(Object.keys(EN_WEEKDAYS));
// "ก.ย." พิมพ์แบบไม่มีจุดท้ายก็ได้
const TH_MONTH = [...TH_MONTHS]
  .sort((a, b) => b[0].length - a[0].length)
  .map(([w]) => (w.endsWith('.') ? `${escape(w.slice(0, -1))}\\.?` : escape(w)))
  .join('|');
const EN_MONTH = alt([...EN_MONTHS, ...EN_MONTHS.map((m) => m.slice(0, 3)), 'sept']);

/** ต้นคำ / ท้ายคำ — ใช้กับภาษาอังกฤษและตัวเลข (ไทยไม่เว้นวรรคระหว่างคำ จึงไม่ใช้กับคำไทยล้วน) */
const B = '(?<=^|[\\s,(])';
const E = '(?=$|[\\s,.)!?])';
const NUM = '\\d{1,3}(?:,\\d{3})+(?:\\.\\d+)?|\\d+(?:\\.\\d+)?';
const EVERY_TH = 'ทุก\\s*(?:ๆ\\s*)?';
const TH_FREQ: Record<string, string> = {
  วัน: 'DAILY',
  สัปดาห์: 'WEEKLY',
  อาทิตย์: 'WEEKLY',
  เดือน: 'MONTHLY',
  ปี: 'YEARLY',
};
/** ต้นคำของเวลา — ติดกับ "เวลา/ตอน/@" ได้ ("เวลา14:30", "@7pm") */
const TB = '(?<=^|[\\s,(@]|เวลา|ตอน)';

function thMonth(word: string): number {
  return TH_MONTHS.find(([name]) => name === word || name === `${word}.`)?.[1] ?? 0;
}

function enMonth(word: string): number {
  const w = word.toLowerCase();
  return EN_MONTHS.findIndex((m) => m === w || m.slice(0, 3) === w.slice(0, 3)) + 1;
}

/** ปี 4 หลัก พ.ศ. (≥ 2400) → ค.ศ. · 2 หลัก: ≥ 50 = พ.ศ. 25xx, ไม่ถึง = ค.ศ. 20xx */
function normalizeYear(text: string | undefined): number | null {
  if (!text) return null;
  const n = Number(text);
  if (text.length === 2) return n >= 50 ? 2500 + n - 543 : 2000 + n;
  return n >= 2400 ? n - 543 : n;
}

// ─── ตัวสแกน ───

class Scanner {
  masked: string;
  readonly tokens: NlToken[] = [];

  constructor(readonly input: string) {
    // เลขไทยแทนด้วยเลขอารบิก — ความยาวเท่าเดิม ตำแหน่งจึงยังตรงกับ input
    this.masked = input.replace(TH_DIGITS, (d) => String(d.charCodeAt(0) - 0x0e50));
  }

  /** `decide` คืน null = ไม่รับ match นี้ (ปล่อยให้ matcher ถัดไปลอง) */
  scan(pattern: string, decide: (m: RegExpExecArray) => TokenBody | null): void {
    const re = new RegExp(pattern, 'giu');
    let m: RegExpExecArray | null;
    while ((m = re.exec(this.masked))) {
      if (m[0].length === 0) {
        re.lastIndex++;
        continue;
      }
      const body = decide(m);
      if (body) this.take(m.index, m.index + m[0].length, body);
    }
  }

  take(start: number, end: number, body: TokenBody): void {
    // ตัดช่องว่างหัวท้ายออกจาก span — raw ที่ highlight จะได้พอดีคำ
    while (start < end && /\s/.test(this.masked[start]!)) start++;
    while (end > start && /\s/.test(this.masked[end - 1]!)) end--;
    this.tokens.push({ ...body, raw: this.input.slice(start, end), start, end } as NlToken);
    this.masked = this.masked.slice(0, start) + ' '.repeat(end - start) + this.masked.slice(end);
  }

  first<K extends NlToken['kind']>(kind: K): Extract<NlToken, { kind: K }> | undefined {
    return this.tokens.find((t): t is Extract<NlToken, { kind: K }> => t.kind === kind);
  }
}

// ─── matcher แต่ละกลุ่ม ───

function scanRecurrence(s: Scanner): void {
  const once = (body: TokenBody) => (s.first('recurrence') ? null : body);
  const weekly = (days: number[]) =>
    once({
      kind: 'recurrence',
      rrule: `FREQ=WEEKLY;BYDAY=${days.map((d) => RRULE_DAYS[d]).join(',')}`,
    });
  const monthDay = (day: string) => {
    const n = Number(day);
    return n >= 1 && n <= 31
      ? once({ kind: 'recurrence', rrule: `FREQ=MONTHLY;BYMONTHDAY=${n}` })
      : null;
  };
  const interval = (n: string, freq: string) =>
    Number(n) >= 1
      ? once({ kind: 'recurrence', rrule: `FREQ=${freq};INTERVAL=${Number(n)}` })
      : null;

  // ทุก 2 สัปดาห์ · every 3 days
  s.scan(`${EVERY_TH}(\\d{1,2})\\s*(วัน|สัปดาห์|อาทิตย์|เดือน|ปี)`, (m) =>
    interval(m[1]!, TH_FREQ[m[2]!]!),
  );
  s.scan(`${B}every\\s+(\\d{1,2})\\s+(day|week|month|year)s?\\b`, (m) =>
    interval(m[1]!, `${m[2]!.toUpperCase()}LY`.replace('DAYLY', 'DAILY')),
  );

  // ทุกวันที่ 5 · ทุกเดือนวันที่ 31 · every 5th · monthly on the 5th
  s.scan(`${EVERY_TH}(?:เดือน\\s*)?(?:วันที่|ที่)\\s*(\\d{1,2})`, (m) => monthDay(m[1]!));
  s.scan(
    `${B}(?:every|monthly\\s+on)\\s+(?:the\\s+)?(\\d{1,2})(?:st|nd|rd|th)(?:\\s+of\\s+(?:the|every)\\s+month)?\\b`,
    (m) => monthDay(m[1]!),
  );

  // วันธรรมดา / สุดสัปดาห์
  s.scan(
    `${EVERY_TH}(?:วัน\\s*ธรรมดา|วันทำงาน|(?:วัน)?จันทร์\\s*(?:ถึง|-)\\s*(?:วัน)?ศุกร์)|${B}(?:every\\s+)?weekdays?\\b`,
    () => weekly([1, 2, 3, 4, 5]),
  );
  s.scan(
    `${EVERY_TH}(?:สุดสัปดาห์|(?:วัน)?เสาร์\\s*(?:-|และ|กับ)?\\s*(?:วัน)?อาทิตย์)|${B}(?:every\\s+)?weekends?\\b`,
    () => weekly([6, 0]),
  );

  // ทุกจันทร์ พุธ ศุกร์ · ทุกวันอังคาร · every monday and thursday
  s.scan(
    `${EVERY_TH}(วัน)?\\s*(${TH_DAY})((?:\\s*(?:,|และ|กับ)?\\s*(?:วัน)?(?:${TH_DAY}))*)`,
    (m) => {
      const names = [m[2]!, ...(m[3]!.match(new RegExp(TH_DAY, 'gu')) ?? [])];
      // "ทุกอาทิตย์" (ไม่มี "วัน") = ทุกสัปดาห์ → ให้ matcher รายสัปดาห์รับไป
      if (names.length === 1 && names[0] === 'อาทิตย์' && !m[1]) return null;
      return weekly([...new Set(names.map((n) => TH_WEEKDAYS[n]!))]);
    },
  );
  s.scan(`${B}every\\s+(${EN_DAY})((?:\\s*(?:,|and)\\s*(?:${EN_DAY}))*)\\b`, (m) => {
    const names = [m[1]!, ...(m[2]!.match(new RegExp(EN_DAY, 'giu')) ?? [])];
    return weekly([...new Set(names.map((n) => EN_WEEKDAYS[n.toLowerCase()]!))]);
  });

  const simple = (freq: string) => once({ kind: 'recurrence', rrule: `FREQ=${freq}` });
  s.scan(`${EVERY_TH}วัน(?!ที่)|${B}(?:daily|every\\s*day)\\b`, () => simple('DAILY'));
  s.scan(`${EVERY_TH}(?:สัปดาห์|อาทิตย์)|${B}(?:weekly|every\\s+week)\\b`, () => simple('WEEKLY'));
  s.scan(`${EVERY_TH}เดือน|${B}(?:monthly|every\\s+month)\\b`, () => simple('MONTHLY'));
  s.scan(`${EVERY_TH}ปี|${B}(?:yearly|annually|every\\s+year)\\b`, () => simple('YEARLY'));
}

function scanDates(s: Scanner, today: string, weekStartsOn: number): void {
  const once = (value: string | null) =>
    value && !s.first('date') ? ({ kind: 'date', value } as const) : null;
  const rel = (n: number) => () => once(addDays(today, n));

  s.scan(`(?:วัน)?มะรืน(?:นี้)?|${B}day\\s+after\\s+tomorrow\\b`, rel(2));
  s.scan(`พรุ่งนี้|${B}(?:tomorrow|tmr)\\b`, rel(1));
  s.scan(`วันนี้|คืนนี้|${B}(?:today|tonight)\\b`, rel(0));
  s.scan(`เมื่อวาน(?:นี้)?|${B}yesterday\\b`, rel(-1));
  s.scan(`สิ้นเดือน(?:นี้)?|${B}end\\s+of\\s+(?:the\\s+)?month\\b`, () => {
    const [y, m] = partsOf(today);
    return once(ymd(y, m, daysInMonth(y, m)));
  });

  /** วันในสัปดาห์: ธรรมดา = ครั้งถัดไป (วันนี้นับด้วย) · "หน้า/next" = ถ้ายังอยู่ในสัปดาห์นี้ให้เลื่อนไปสัปดาห์หน้า */
  const weekday = (day: number, next: boolean) => {
    let date = nextWeekday(today, day);
    if (next && startOfWeek(date, weekStartsOn) === startOfWeek(today, weekStartsOn)) {
      date = addDays(date, 7);
    }
    return once(date);
  };
  // ต้องมาก่อน "อาทิตย์หน้า" (= สัปดาห์หน้า) เพื่อให้ "วันอาทิตย์หน้า" เป็นวันอาทิตย์
  s.scan(`(วัน\\s*)?(?<=^|[\\s,(]|วัน\\s*)(${TH_DAY})\\s*(หน้า|นี้)?`, (m) => {
    if (m[2] === 'อาทิตย์' && !m[1] && m[3] === 'หน้า') return null;
    return weekday(TH_WEEKDAYS[m[2]!]!, m[3] === 'หน้า');
  });
  s.scan(`${B}(?:on\\s+)?(?:(next|this)\\s+)?(${EN_DAY})\\b`, (m) =>
    weekday(EN_WEEKDAYS[m[2]!.toLowerCase()]!, m[1]?.toLowerCase() === 'next'),
  );
  s.scan(`(?:สัปดาห์|อาทิตย์)หน้า|${B}next\\s+week\\b`, () =>
    once(addDays(startOfWeek(today, weekStartsOn), 7)),
  );
  s.scan(`เดือนหน้า|${B}next\\s+month\\b`, () => {
    const [y, m] = partsOf(today);
    return once(m === 12 ? ymd(y + 1, 1, 1) : ymd(y, m + 1, 1));
  });

  /** วันที่ชัดเจน · ไม่ระบุปีแล้วเลยไปแล้ว = ปีหน้า · วันที่ไม่มีจริง (31/2) = ไม่รับ */
  const explicit = (day: number, month: number, yearText?: string) => {
    if (month < 1 || month > 12) return null;
    let year = normalizeYear(yearText) ?? partsOf(today)[0];
    if (day < 1 || day > daysInMonth(year, month)) return null;
    if (!yearText && ymd(year, month, day) < today) {
      year += 1;
      if (day > daysInMonth(year, month)) return null;
    }
    return once(ymd(year, month, day));
  };
  // ปีหลังชื่อเดือนไทยเป็น พ.ศ. (4 หลัก หรือ 2 หลัก 50–99) — "1 ธ.ค. 10 โมง" เลข 10 คือเวลา ไม่ใช่ปี
  const NOT_YEAR = '(?!\\s*(?:โมง|ทุ่ม|นาฬิกา|น\\.|[:.]\\d|บาท|฿))';
  s.scan(
    `(?:วันที่\\s*)?(?<=^|[\\s,(]|วันที่\\s*)(\\d{1,2})\\s*(${TH_MONTH})(?:\\s*(\\d{4}|[5-9]\\d)${NOT_YEAR}${E})?`,
    (m) => explicit(Number(m[1]), thMonth(m[2]!), m[3]),
  );
  s.scan(
    `${B}(?:on\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(${EN_MONTH})\\.?(?:\\s+(\\d{4}))?\\b`,
    (m) => explicit(Number(m[1]), enMonth(m[2]!), m[3]),
  );
  s.scan(
    `${B}(?:on\\s+)?(${EN_MONTH})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b`,
    (m) => explicit(Number(m[2]), enMonth(m[1]!), m[3]),
  );
  s.scan(`${B}(?:วันที่\\s*)?(\\d{1,2})/(\\d{1,2})(?:/(\\d{4}|\\d{2}))?${E}`, (m) =>
    explicit(Number(m[1]), Number(m[2]), m[3]),
  );
  // "วันที่ 20" ลอย ๆ = วันที่ 20 ครั้งถัดไป (วันนี้นับด้วย)
  s.scan(`วันที่\\s*(\\d{1,2})${E}`, (m) => {
    const day = Number(m[1]);
    return day >= 1 && day <= 31 ? once(nextMonthDay(today, day)) : null;
  });
}

function scanTimes(s: Scanner): void {
  const AT = `(?:(?:เวลา|ตอน)\\s*|${B}(?:at|@)\\s*)?`;
  const HALF = '(\\s*ครึ่ง)?';
  const once = (h: number, min = 0) =>
    h >= 0 && h <= 23 && min >= 0 && min <= 59 && !s.first('time')
      ? ({ kind: 'time', value: `${pad(h)}:${pad(min)}` } as const)
      : null;
  const half = (m: string | undefined) => (m ? 30 : 0);

  s.scan(`${AT}(?:เที่ยงคืน|${B}midnight\\b)`, () => once(0));
  s.scan(`${AT}(?:เที่ยง(?:วัน|ตรง)?|${B}noon\\b)${HALF}`, (m) => once(12, half(m[1])));
  // ตี 5 = 05:00 · บ่าย 2 / บ่ายโมง = 14:00 / 13:00 · 2 ทุ่ม = 20:00
  s.scan(`${AT}ตี\\s*(\\d{1,2})${HALF}`, (m) =>
    Number(m[1]) <= 5 ? once(Number(m[1]), half(m[2])) : null,
  );
  s.scan(`${AT}บ่าย\\s*(?:(\\d{1,2})\\s*(?:โมง)?|โมง)${HALF}`, (m) => {
    const n = m[1] ? Number(m[1]) : 1;
    return n >= 1 && n <= 5 ? once(12 + n, half(m[2])) : null;
  });
  s.scan(`${AT}(\\d{1,2})\\s*ทุ่ม${HALF}`, (m) => {
    const n = Number(m[1]);
    return n >= 1 && n <= 5 ? once(18 + n, half(m[2])) : null;
  });
  // 8 โมงเช้า · 4 โมงเย็น · 5 โมง (1–6 = บ่าย/เย็น, 7–11 = เช้า)
  s.scan(`${AT}(\\d{1,2})\\s*โมง\\s*(เช้า|เย็น|ตรง)?${HALF}`, (m) => {
    const n = Number(m[1]);
    if (n < 1 || n > 12) return null;
    const pm = m[2] === 'เย็น' || (m[2] !== 'เช้า' && n <= 6);
    return once(pm && n < 12 ? n + 12 : n, half(m[3]));
  });
  // 14:30 · 14.30 น. · 7:30pm · 5pm · 9 a.m.
  s.scan(`${AT}${TB}(\\d{1,2})(?::(\\d{2}))?\\s*(a\\.?m\\.?|p\\.?m\\.?)(?=$|[\\s,)!?])`, (m) => {
    let h = Number(m[1]);
    if (h < 1 || h > 12) return null;
    if (/^p/i.test(m[3]!) && h < 12) h += 12;
    if (/^a/i.test(m[3]!) && h === 12) h = 0;
    return once(h, Number(m[2] ?? 0));
  });
  s.scan(`${AT}${TB}(\\d{1,2})[:.](\\d{2})\\s*(?:น\\.|นาฬิกา)`, (m) =>
    once(Number(m[1]), Number(m[2])),
  );
  s.scan(`${AT}${TB}(\\d{1,2}):(\\d{2})${E}`, (m) => once(Number(m[1]), Number(m[2])));
  s.scan(`${AT}${TB}(\\d{1,2})\\s*(?:นาฬิกา|น\\.)`, (m) => once(Number(m[1])));
}

function scanSigils(s: Scanner): void {
  // token ต้องขึ้นต้นคำ — "C#" และ "1+1" ไม่ใช่แท็ก/โปรเจกต์
  s.scan(`${B}!(?:(!{0,2})|([\\p{L}\\p{M}]+))(?=$|\\s)`, (m) => {
    const value =
      m[2] !== undefined ? PRIORITY_ALIASES[m[2].toLowerCase()] : BANG_PRIORITY[m[1]!.length];
    return value ? { kind: 'priority', value } : null; // "!important" ไม่รู้จัก → เก็บไว้ในชื่อ
  });
  const WORD = '[\\p{L}\\p{M}\\p{N}_.-]*[\\p{L}\\p{M}_][\\p{L}\\p{M}\\p{N}_.-]*';
  s.scan(`${B}#(${WORD})(?=$|\\s)`, (m) => ({ kind: 'tag', value: m[1]! }));
  // ตัวเลขล้วน ("+500") คือรายรับ ไม่ใช่โปรเจกต์
  s.scan(`${B}\\+(${WORD})(?=$|\\s)`, (m) => ({ kind: 'project', value: m[1]! }));
}

function scanNumbers(s: Scanner): void {
  const durationUnit = alt(Object.keys(DURATION_UNITS));
  s.scan(`${B}(${NUM})\\s*(${durationUnit})${E}`, (m) => ({
    kind: 'duration',
    minutes: Math.round(Number(m[1]!.replace(/,/g, '')) * DURATION_UNITS[m[2]!.toLowerCase()]!),
  }));
  s.scan(`${B}(${NUM})\\s*(${alt(QUANTITY_UNITS)})${E}`, (m) => ({
    kind: 'quantity',
    value: Number(m[1]!.replace(/,/g, '')),
    unit: m[2]!.toLowerCase(),
  }));

  // จำนวนเงิน: มีหน่วยเงินชนะ ไม่งั้นเอาตัวเลขลอยตัวสุดท้าย ("iphone 15 pro 35900" = 35,900)
  const re = new RegExp(`${B}(\\+)?(฿\\s*)?(${NUM})\\s*(บาท|฿|thb|baht)?${E}`, 'giu');
  const candidates = [...s.masked.matchAll(re)];
  const chosen = candidates.find((m) => m[2] || m[4]) ?? candidates.at(-1);
  if (chosen) {
    s.take(chosen.index, chosen.index + chosen[0].length, {
      kind: 'amount',
      value: chosen[3]!,
      hasCurrency: Boolean(chosen[2] || chosen[4]),
      income: Boolean(chosen[1]),
    });
  }
}

// ─── การเกิดซ้ำ → รอบแรก ───

/** รอบแรกของ rrule ที่ parser สร้าง ตรงหรือหลัง `from` */
function firstOccurrence(rrule: string, from: string): string {
  const parts = Object.fromEntries(rrule.split(';').map((p) => p.split('=') as [string, string]));
  if (parts.BYMONTHDAY) return nextMonthDay(from, Number(parts.BYMONTHDAY));
  if (parts.BYDAY) {
    const days = parts.BYDAY.split(',').map((d) =>
      RRULE_DAYS.indexOf(d as (typeof RRULE_DAYS)[number]),
    );
    return days.map((d) => nextWeekday(from, d)).sort()[0]!;
  }
  return from;
}

/** รอบถัดไปหลังรอบ `date` — ใช้ตอนเวลาของรอบแรกเลยไปแล้ว */
function afterOccurrence(rrule: string, date: string): string {
  const parts = Object.fromEntries(rrule.split(';').map((p) => p.split('=') as [string, string]));
  if (parts.BYMONTHDAY || parts.BYDAY) return firstOccurrence(rrule, addDays(date, 1));
  const n = Number(parts.INTERVAL ?? 1);
  const [y, m, d] = partsOf(date);
  switch (parts.FREQ) {
    case 'WEEKLY':
      return addDays(date, 7 * n);
    case 'MONTHLY': {
      const idx = y * 12 + (m - 1) + n;
      const [ny, nm] = [Math.floor(idx / 12), (idx % 12) + 1];
      return ymd(ny, nm, Math.min(d, daysInMonth(ny, nm)));
    }
    case 'YEARLY':
      return ymd(y + n, m, Math.min(d, daysInMonth(y + n, m)));
    default:
      return addDays(date, n);
  }
}

/** ตัด token ออกจากข้อความ — ตำแหน่งเป็น UTF-16 index เหมือน String.slice (emoji ไม่ทำให้เลื่อน) */
function stripTokens(input: string, tokens: readonly NlToken[]): string {
  let out = '';
  let cursor = 0;
  for (const t of [...tokens].sort((a, b) => a.start - b.start)) {
    out += `${input.slice(cursor, t.start)} `;
    cursor = t.end;
  }
  return (out + input.slice(cursor)).replace(/\s+/g, ' ').replace(/^[\s,-]+|[\s,-]+$/g, '');
}

/**
 * ชื่อรายการที่ "เก็บ" token บางชนิดไว้ — แต่ละโมดูลมองตัวเลขต่างกัน
 * งาน "กาแฟ 65" ต้องชื่อ "กาแฟ 65" · รายจ่าย "ซื้อ 2 ขวด 50 บาท" ควรชื่อ "ซื้อ 2 ขวด"
 */
export function remainingText(result: NlResult, keep: readonly NlToken['kind'][]): string {
  return stripTokens(
    result.input,
    result.tokens.filter((t) => !keep.includes(t.kind)),
  );
}

// ─── ทางเข้า ───

export function parseNaturalText(input: string, ctx: NlContext): NlResult {
  const s = new Scanner(input);
  const today = formatInTimeZone(ctx.now, ctx.timeZone);

  scanRecurrence(s);
  scanDates(s, today, ctx.weekStartsOn ?? 1);
  scanTimes(s);
  scanSigils(s);
  scanNumbers(s);

  const rrule = s.first('recurrence')?.rrule ?? null;
  const time = s.first('time')?.value ?? null;
  let date = s.first('date')?.value ?? null;

  if (!date) {
    // เวลาที่เลยไปแล้วของวันนี้ = รอบถัดไป ("standup 9am" ตอน 10 โมง = พรุ่งนี้ 9 โมง)
    const nowHm = dateTimeFormat('en-GB', {
      timeZone: ctx.timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(ctx.now);
    const passed = (d: string) => d === today && time !== null && time <= nowHm;
    if (rrule) {
      date = firstOccurrence(rrule, today);
      if (passed(date)) date = afterOccurrence(rrule, date);
    } else if (time) {
      date = passed(today) ? addDays(today, 1) : today;
    }
  }

  const tokens = [...s.tokens].sort((a, b) => a.start - b.start);
  const title = stripTokens(input, tokens);

  const amount = s.first('amount');
  const durations = tokens.filter((t) => t.kind === 'duration');

  return {
    input,
    title,
    date,
    time,
    occurredAt: date ? zonedTimeToUtc(`${date}T${time ?? '00:00'}:00`, ctx.timeZone) : null,
    isAllDay: time === null,
    rrule,
    priority: tokens.filter((t) => t.kind === 'priority').at(-1)?.value ?? null,
    // ไม่สนตัวพิมพ์ — ตัวแรกชนะ
    tags: tokens
      .filter((t) => t.kind === 'tag')
      .map((t) => t.value)
      .filter((v, i, all) => all.findIndex((x) => x.toLowerCase() === v.toLowerCase()) === i),
    project: tokens.filter((t) => t.kind === 'project').at(-1)?.value ?? null,
    amount: amount?.value ?? null,
    income: amount?.income ?? false,
    durationMinutes: durations.length > 0 ? durations.reduce((sum, t) => sum + t.minutes, 0) : null,
    quantities: tokens
      .filter((t) => t.kind === 'quantity')
      .map((t) => ({ value: t.value, unit: t.unit })),
    tokens,
  };
}
