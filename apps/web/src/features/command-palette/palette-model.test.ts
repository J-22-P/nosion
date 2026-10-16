import type { ParsedEntryDto } from '@nosion/contracts';
import { parseNaturalText } from '@nosion/core/nl';
import { describe, expect, it } from 'vitest';
import {
  createLabel,
  describeParsed,
  describeRrule,
  entryHref,
  filterCommands,
  highlightSegments,
  paletteMode,
} from './palette-model';

const TZ = 'Asia/Bangkok';
const NOW = new Date('2026-10-16T03:00:00Z'); // ศุกร์ 10:00

const parsed = (over: Partial<ParsedEntryDto>): ParsedEntryDto => ({
  module: 'expense',
  title: 'กาแฟ',
  occurredAt: NOW.toISOString(),
  isAllDay: false,
  priority: 'none',
  payload: { amountMinor: 6500, currency: 'THB', category: 'food', direction: 'expense' },
  rrule: null,
  reminders: [],
  confidence: 0.9,
  matchedTokens: [],
  ...over,
});

describe('palette-model', () => {
  it('โหมด: ว่าง = idle · ">" = command · อื่น ๆ = create', () => {
    expect(paletteMode('  ')).toBe('idle');
    expect(paletteMode('> ธีม')).toBe('command');
    expect(paletteMode('กาแฟ 65')).toBe('create');
  });

  it('คำสั่ง: ทุกคำต้องเจอ ไทยหรืออังกฤษก็ได้', () => {
    expect(filterCommands('>').length).toBeGreaterThan(5);
    expect(filterCommands('> calendar').map((c) => c.id)).toEqual(['go:/calendar']);
    expect(filterCommands('> ธีม มืด').map((c) => c.id)).toEqual(['theme:dark']);
    expect(filterCommands('> ไม่มีแน่นอน')).toEqual([]);
  });

  it('สเปก 8.3: "กาแฟ 65" → สร้างรายจ่าย · กาแฟ · ฿65 · อาหาร · วันนี้ 10:00', () => {
    const p = parsed({});
    expect(createLabel(p)).toBe('สร้างรายจ่าย');
    expect(describeParsed(p, TZ, NOW)).toBe('กาแฟ · ฿65 · อาหาร · วันนี้ 10:00');
  });

  it('DoD: บิลรายเดือน → สร้างบิลประจำ · ↻ ทุกเดือน วันที่ 5 · 🔔', () => {
    const bill = parsed({
      title: 'ค่าเน็ต',
      payload: { amountMinor: 79900, currency: 'THB', category: 'utilities', isBill: true },
      rrule: 'FREQ=MONTHLY;BYMONTHDAY=5',
      isAllDay: true,
      reminders: [{ channel: 'push', offsetMinutes: -900 }],
    });
    expect(createLabel(bill)).toBe('สร้างบิลประจำ');
    expect(describeParsed(bill, TZ, NOW)).toBe(
      'ค่าเน็ต · ฿799 · สาธารณูปโภค · ↻ ทุกเดือน วันที่ 5 · 🔔 เตือน 1',
    );
  });

  it('RRULE → ภาษาคน', () => {
    expect(describeRrule('FREQ=DAILY')).toBe('ทุกวัน');
    expect(describeRrule('FREQ=WEEKLY;INTERVAL=2')).toBe('ทุก 2 สัปดาห์');
    expect(describeRrule('FREQ=WEEKLY;BYDAY=MO,WE,FR')).toBe('ทุกจันทร์, พุธ, ศุกร์');
    expect(describeRrule('FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR')).toBe('ทุกวันธรรมดา');
    expect(describeRrule('FREQ=YEARLY')).toBe('ทุกปี');
  });

  it('highlight จาก parser ฝั่ง client — ต่อกลับได้ข้อความเดิม', () => {
    const input = 'ค่าเน็ต 799 ทุกวันที่ 5';
    const segs = highlightSegments(
      input,
      parseNaturalText(input, { now: NOW, timeZone: TZ }).tokens,
    );
    expect(segs.map((s) => s.text).join('')).toBe(input);
    expect(segs.filter((s) => s.kind).map((s) => [s.kind, s.text])).toEqual([
      ['amount', '799'],
      ['recurrence', 'ทุกวันที่ 5'],
    ]);
  });

  it('ผลค้นหา: มีวันที่ = เปิดวันนั้นในปฏิทิน (ตามโซนผู้ใช้) · ไม่มี = หน้าโมดูล', () => {
    expect(
      entryHref({ module: 'task', title: 'x', occurredAt: '2026-10-16T18:00:00.000Z' }, TZ),
    ).toBe('/calendar?date=2026-10-17');
    expect(entryHref({ module: 'task', title: 'a b', occurredAt: null }, TZ)).toBe(
      '/tasks?q=a%20b',
    );
    expect(entryHref({ module: 'expense', title: 'x', occurredAt: null }, TZ)).toBe('/expenses');
  });
});
