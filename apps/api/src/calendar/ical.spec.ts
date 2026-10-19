import type { CalendarEventDto } from '@nosion/contracts';
import { describe, expect, it } from 'vitest';
import { buildIcal, escapeText, eventUid, foldLine } from './ical';

const event = (over: Partial<CalendarEventDto> = {}): CalendarEventDto => ({
  id: 'task:e1',
  entryId: 'e1',
  ruleId: null,
  version: 1,
  module: 'task',
  title: 'ส่งรายงาน',
  start: '2026-10-20T03:00:00.000Z',
  end: null,
  allDay: false,
  date: '2026-10-20',
  endDate: null,
  status: 'pending',
  color: '#000',
  projected: false,
  hasReminder: false,
  actions: [],
  meta: {},
  ...over,
});

const opts = { name: 'NOSION', timeZone: 'Asia/Bangkok', now: new Date('2026-10-16T03:00:00Z') };

describe('ical', () => {
  it('escape อักขระพิเศษตาม RFC 5545', () => {
    expect(escapeText('a,b;c\\d\ne')).toBe('a\\,b\\;c\\\\d\\ne');
  });

  it('พับบรรทัดที่ 75 byte โดยไม่ตัดกลางตัวอักษรไทย (3 byte/ตัว)', () => {
    const folded = foldLine(`SUMMARY:${'ก'.repeat(60)}`);
    const lines = folded.split('\r\n');
    expect(lines.length).toBeGreaterThan(1);
    for (const [i, line] of lines.entries()) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
      if (i > 0) expect(line.startsWith(' ')).toBe(true);
    }
    // ต่อกลับได้ข้อความเดิม (client ตัด CRLF + ช่องว่างออก)
    expect(folded.replace(/\r\n /g, '')).toBe(`SUMMARY:${'ก'.repeat(60)}`);
  });

  it('รายการมีเวลา = UTC · ทั้งวัน = VALUE=DATE และ DTEND วันถัดไป', () => {
    const ics = buildIcal(
      [
        event(),
        event({
          id: 'expense:e2',
          module: 'expense',
          title: 'ค่าเน็ต · ฿799.00',
          allDay: true,
          date: '2026-10-31',
        }),
      ],
      opts,
    );
    expect(ics).toContain('DTSTART:20261020T030000Z');
    expect(ics).toContain('DTSTART;VALUE=DATE:20261031\r\nDTEND;VALUE=DATE:20261101');
    expect(ics).toContain('SUMMARY:ค่าเน็ต · ฿799.00');
    expect(ics).toContain('CATEGORIES:EXPENSE');
    expect(ics).toContain('DTSTAMP:20261016T030000Z');
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics.split('\r\n').every((l) => !l.includes('\n'))).toBe(true);
  });

  it('หลายวัน = ช่วงทั้งวัน DTSTART วันแรก · DTEND วันถัดจากวันสุดท้าย (แม้งานมีเวลา)', () => {
    const ics = buildIcal([event({ date: '2026-10-20', endDate: '2026-10-24' })], opts);
    expect(ics).toContain('DTSTART;VALUE=DATE:20261020\r\nDTEND;VALUE=DATE:20261025');
  });

  it('งานเสร็จแล้วมีเครื่องหมาย ✓', () => {
    expect(buildIcal([event({ status: 'done' })], opts)).toContain('SUMMARY:✓ ส่งรายงาน');
  });

  it('UID ของรอบจากกฎเหมือนกันทั้งตอน projected และตอนถูกสร้างจริง', () => {
    const projected = event({
      id: 'task:projected:r1:1',
      entryId: null,
      ruleId: 'r1',
      projected: true,
    });
    const real = event({ id: 'task:e9', entryId: 'e9', ruleId: 'r1' });
    expect(eventUid(projected)).toBe(eventUid(real));
    expect(eventUid(event())).toBe('task-e1@nosion');
  });
});
