import type { HabitKind } from '@nosion/contracts';
import type { NlResult } from '@nosion/core';

/**
 * ตีความผลของ parser กลางเป็นนิสัย (สเปก 6.4: "ดื่มน้ำ 8 แก้ว ทุกวัน" → target=8, unit=แก้ว, FREQ=DAILY)
 * pure — ไม่แตะฐานข้อมูล · คืน null เมื่อไม่ใช่นิสัยแน่ ๆ (มีจำนวนเงิน = รายจ่าย)
 */
export interface ParsedHabitText {
  title: string;
  kind: HabitKind;
  targetValue: number;
  unit: string;
  deadlineLocalTime: string | null;
  cadence: 'daily' | 'weekly';
  weeklyTarget: number | null;
  /** นิสัยต้องเกิดซ้ำเสมอ — ไม่ระบุ = ทุกวัน */
  rrule: string;
  confidence: number;
  matchedTokens: string[];
}

/** คำที่บอกว่าเป็นกิจวัตร */
const HABIT_HINTS = [
  'ดื่มน้ำ',
  'ออกกำลัง',
  'วิ่ง',
  'เดิน',
  'นั่งสมาธิ',
  'สมาธิ',
  'อ่านหนังสือ',
  'นอน',
  'ตื่น',
  'ยืดเส้น',
  'โยคะ',
  'กินผัก',
  'กินวิตามิน',
  'แปรงฟัน',
  'เขียนบันทึก',
  'meditate',
  'water',
  'exercise',
  'workout',
  'read',
  'journal',
  'stretch',
  'sleep',
  'walk',
];

/**
 * "3 ครั้งต่อสัปดาห์" · "3 ครั้ง/สัปดาห์" · "3 times a week" · "3x per week"
 * จับจากข้อความตรง ๆ — "ครั้งต่อ" ติดกันไม่มีขอบคำ parser กลางจึงเห็น "3" เป็นตัวเลขลอย (เงิน) ไม่ใช่ปริมาณ
 */
const PER_WEEK = /(\d{1,2})\s*(?:ครั้ง|times|x)\s*(?:ต่อ|\/|a|per)?\s*(?:สัปดาห์|อาทิตย์|week)/i;
/** "นอนก่อน 23:45" — "ก่อน" อยู่หน้าเวลาที่ parser หยิบไปแล้ว */
const BEFORE = /(ก่อน|before|by)\s*$/i;

/** ตัดช่วง [start, end) ออกจากข้อความ (UTF-16 index เหมือนตำแหน่ง token ของ parser) */
function withoutSpans(input: string, spans: { start: number; end: number }[]): string {
  let out = '';
  let cursor = 0;
  for (const s of [...spans].sort((a, b) => a.start - b.start)) {
    if (s.start < cursor) continue;
    out += `${input.slice(cursor, s.start)} `;
    cursor = s.end;
  }
  return (out + input.slice(cursor)).replace(/\s+/g, ' ').trim();
}

export function interpretHabit(nl: NlResult): ParsedHabitText | null {
  const perWeek = PER_WEEK.exec(nl.input);
  // มีจำนวนเงิน → ให้โมดูลการเงินรับ (ยกเว้นตัวเลขนั้นคือ "N ครั้งต่อสัปดาห์")
  if (nl.amount && !perWeek) return null;

  const quantity = nl.tokens.find((t) => t.kind === 'quantity');
  const time = nl.tokens.find((t) => t.kind === 'time');
  const recurrence = nl.tokens.find((t) => t.kind === 'recurrence');
  const matched: string[] = [];

  // ข้อความก่อน token เวลา ลงท้ายด้วย "ก่อน" = ต้องทำให้เสร็จก่อนเวลานั้น
  const beforeTime =
    time?.kind === 'time' && BEFORE.test(nl.input.slice(0, time.start)) ? time.value : null;

  // ตัด token ทั้งหมด + ช่วง "N ครั้งต่อสัปดาห์" (ตัวเลขในนั้นถูก parser มองเป็นเงิน — ตัดทั้งช่วงแทน)
  const cut = perWeek ? { start: perWeek.index, end: perWeek.index + perWeek[0].length } : null;
  let title = withoutSpans(nl.input, [
    ...nl.tokens.filter((t) => !cut || t.end <= cut.start || t.start >= cut.end),
    ...(cut ? [cut] : []),
  ]).replace(/(ก่อน|before|by)\s*$/i, '');
  if (!title) return null;

  let confidence = 0.3;
  if (recurrence) {
    confidence += 0.35;
    matched.push(recurrence.raw);
  }
  if (HABIT_HINTS.some((h) => title.toLowerCase().includes(h))) confidence += 0.15;

  let kind: HabitKind = 'check';
  let targetValue = 1;
  let unit = 'ครั้ง';
  let cadence: 'daily' | 'weekly' = 'daily';
  let weeklyTarget: number | null = null;

  if (perWeek) {
    cadence = 'weekly';
    weeklyTarget = Math.max(1, Number(perWeek[1]));
    confidence += 0.35; // บอกความถี่ต่อสัปดาห์ = นิสัยชัด ๆ แม้ไม่มี "ทุก…"
    matched.push(perWeek[0]);
  } else if (quantity?.kind === 'quantity') {
    kind = 'count';
    targetValue = quantity.value;
    unit = quantity.unit;
    confidence += 0.2;
    matched.push(quantity.raw);
  }

  if (beforeTime) {
    kind = 'before_time';
    targetValue = 1;
    confidence += 0.2;
    matched.push(`ก่อน ${beforeTime}`);
  } else if (time) {
    confidence -= 0.1; // มีเวลานัด = น่าจะเป็นงาน ("standup ทุกวันธรรมดา 10 โมง")
  }

  if (!recurrence && !perWeek) confidence = Math.min(confidence, 0.45); // ไม่บอกว่าทำซ้ำ = ไม่น่าใช่นิสัย
  title = title.replace(/^[,\s-]+|[,\s-]+$/g, '');

  return {
    title,
    kind,
    targetValue,
    unit,
    deadlineLocalTime: beforeTime,
    cadence,
    weeklyTarget,
    rrule: nl.rrule ?? 'FREQ=DAILY',
    confidence: Math.max(0.05, Math.min(confidence, 0.95)),
    matchedTokens: matched,
  };
}
