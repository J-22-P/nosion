import { parseNaturalText } from '@nosion/core/nl';
import { describe, expect, it } from 'vitest';
import { buildChips, dayLabel, rawFor, replaceSpan, sameName, withDate } from './nl-chips';

const ctx = { now: new Date('2026-10-16T03:00:00Z'), timeZone: 'Asia/Bangkok' }; // ศุกร์ 10:00
const TODAY = '2026-10-16';
const TASK = ['date', 'time', 'recurrence', 'priority', 'tag', 'project', 'duration'] as const;

describe('nl-chips', () => {
  it('chip ของงาน: วัน เวลา priority แท็ก โปรเจกต์ — เงินไม่ใช่ chip ของงาน', () => {
    const nl = parseNaturalText('ซื้อของ 500 พรุ่งนี้ 5 โมง !urgent #home +q4', ctx);
    expect(buildChips(nl, TASK, TODAY).map((c) => [c.kind, c.label, c.editor, c.tone])).toEqual([
      ['date', 'พรุ่งนี้', 'date', 'default'],
      ['time', '17:00', 'time', 'default'],
      ['priority', '!ด่วน', 'priority', 'danger'],
      ['tag', '#home', 'text', 'default'],
      ['project', '+q4', 'text', 'default'],
    ]);
  });

  it('แก้ chip = เขียนข้อความใหม่ที่ parser อ่านกลับได้ชนิดเดิม (round-trip)', () => {
    const input = 'ส่งรายงาน พรุ่งนี้ 5 โมง !high';
    const nl = parseNaturalText(input, ctx);
    const [date, time, priority] = buildChips(nl, TASK, TODAY);

    const moved = replaceSpan(input, date!.start, date!.end, rawFor('date', '2026-10-23'));
    expect(parseNaturalText(moved, ctx)).toMatchObject({
      title: 'ส่งรายงาน',
      date: '2026-10-23',
      time: '17:00',
    });

    const retimed = replaceSpan(input, time!.start, time!.end, rawFor('time', '09:30'));
    expect(parseNaturalText(retimed, ctx)).toMatchObject({ date: '2026-10-17', time: '09:30' });

    const lower = replaceSpan(input, priority!.start, priority!.end, rawFor('priority', 'low'));
    expect(parseNaturalText(lower, ctx).priority).toBe('low');
  });

  it('ลบ chip ในข้อความไทยที่ไม่เว้นวรรค · ช่องว่างไม่ซ้อน', () => {
    const input = 'ส่งรายงานพรุ่งนี้ #work';
    const nl = parseNaturalText(input, ctx);
    const date = buildChips(nl, TASK, TODAY)[0]!;
    expect(replaceSpan(input, date.start, date.end, '')).toBe('ส่งรายงาน #work');
    expect(replaceSpan('a #x b', 2, 4, '')).toBe('a b');
  });

  it('ตัวเลือกวันที่: แทน token เดิม / ต่อท้าย / ลบ', () => {
    const plain = 'ส่งรายงาน';
    expect(withDate(plain, parseNaturalText(plain, ctx), '2026-11-01')).toBe('ส่งรายงาน 1/11/2026');
    const dated = 'ส่งรายงาน พรุ่งนี้ #x';
    expect(withDate(dated, parseNaturalText(dated, ctx), '2026-11-01')).toBe(
      'ส่งรายงาน 1/11/2026 #x',
    );
    expect(withDate(dated, parseNaturalText(dated, ctx), '')).toBe('ส่งรายงาน #x');
  });

  it('แท็ก/โปรเจกต์ที่มีช่องว่างกลายเป็น "-" · ชื่อเทียบแบบไม่สนตัวพิมพ์', () => {
    expect(rawFor('project', 'Auth v2')).toBe('+Auth-v2');
    expect(sameName('auth-v2', 'Auth v2')).toBe(true);
    expect(dayLabel('2026-10-23', TODAY)).toMatch(/23/);
  });
});
