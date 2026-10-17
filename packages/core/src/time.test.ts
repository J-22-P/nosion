import { describe, expect, it } from 'vitest';
import {
  dayBoundsInTimeZone,
  formatInTimeZone,
  greetingFor,
  isEntryOverdue,
  monthBoundsInTimeZone,
  periodBounds,
  resolveDateInput,
  timeZoneOffsetMs,
  zonedTimeToUtc,
} from './time';

describe('formatInTimeZone', () => {
  it('ข้ามวันถูกต้องเมื่อ UTC กับ Bangkok คนละวัน', () => {
    // 2026-09-17 18:00Z = 2026-09-18 01:00 ตามเวลาไทย
    const d = new Date('2026-09-17T18:00:00Z');
    expect(formatInTimeZone(d, 'UTC')).toBe('2026-09-17');
    expect(formatInTimeZone(d, 'Asia/Bangkok')).toBe('2026-09-18');
  });
});

describe('zonedTimeToUtc', () => {
  it('แปลงเวลาไทยเป็น UTC (ไม่มี DST)', () => {
    expect(zonedTimeToUtc('2026-09-18T07:00:00', 'Asia/Bangkok').toISOString()).toBe(
      '2026-09-18T00:00:00.000Z',
    );
  });

  it('จัดการ DST ของ New York ได้ทั้งฤดูหนาวและฤดูร้อน', () => {
    expect(zonedTimeToUtc('2026-01-15T09:00:00', 'America/New_York').toISOString()).toBe(
      '2026-01-15T14:00:00.000Z', // EST = UTC-5
    );
    expect(zonedTimeToUtc('2026-07-15T09:00:00', 'America/New_York').toISOString()).toBe(
      '2026-07-15T13:00:00.000Z', // EDT = UTC-4
    );
  });

  it('วันที่ DST เริ่ม (นาฬิกาเดินหน้า) ยังคำนวณ offset ถูก', () => {
    // 8 มี.ค. 2026 เวลา 02:00 EST → กระโดดเป็น 03:00 EDT
    const after = zonedTimeToUtc('2026-03-08T03:00:00', 'America/New_York');
    expect(after.toISOString()).toBe('2026-03-08T07:00:00.000Z');
  });
});

describe('dayBoundsInTimeZone', () => {
  it('ขอบวันของคนไทยคือ 17:00Z ของวันก่อนหน้า', () => {
    const { start, end } = dayBoundsInTimeZone(new Date('2026-09-18T10:00:00Z'), 'Asia/Bangkok');
    expect(start.toISOString()).toBe('2026-09-17T17:00:00.000Z');
    expect(end.toISOString()).toBe('2026-09-18T17:00:00.000Z');
  });
});

describe('timeZoneOffsetMs', () => {
  it('Bangkok = UTC+7 เสมอ', () => {
    expect(timeZoneOffsetMs(new Date('2026-01-01T00:00:00Z'), 'Asia/Bangkok')).toBe(7 * 3600_000);
    expect(timeZoneOffsetMs(new Date('2026-07-01T00:00:00Z'), 'Asia/Bangkok')).toBe(7 * 3600_000);
  });
});

describe('resolveDateInput', () => {
  it('date ล้วน = 00:00 ตามโซนผู้ใช้ ไม่ใช่ 00:00 UTC', () => {
    expect(resolveDateInput('2026-10-01', 'Asia/Bangkok').toISOString()).toBe(
      '2026-09-30T17:00:00.000Z',
    );
    // New York: วันที่ 1 ต.ค. ยังเป็นวันที่ 1 (new Date('2026-10-01') จะได้ 30 ก.ย. 20:00 ตามเวลาท้องถิ่น)
    expect(resolveDateInput('2026-10-01', 'America/New_York').toISOString()).toBe(
      '2026-10-01T04:00:00.000Z',
    );
  });

  it('Date ที่มีเวลาจริงอยู่แล้วคงเดิม · รูปแบบผิด → RangeError', () => {
    const at = new Date('2026-10-01T10:30:00Z');
    expect(resolveDateInput(at, 'Asia/Bangkok')).toBe(at);
    expect(() => resolveDateInput('1/10/2026', 'Asia/Bangkok')).toThrow(RangeError);
  });
});

describe('isEntryOverdue', () => {
  const TZ = 'Asia/Bangkok';
  const dueToday = resolveDateInput('2026-09-18', TZ); // 18 ก.ย. 00:00 เวลาไทย
  const at = (iso: string) => new Date(iso);

  it('งานทั้งวัน: กำหนดวันนี้ยังไม่เลยตลอดทั้งวัน · เลยเมื่อขึ้นวันใหม่ (บั๊กเดิม: เลยตั้งแต่ 07:00)', () => {
    const task = { occurredAt: dueToday, isAllDay: true, status: 'pending' };
    expect(isEntryOverdue(task, at('2026-09-18T00:30:00Z'), TZ)).toBe(false); // 07:30 วันนั้น
    expect(isEntryOverdue(task, at('2026-09-18T16:59:59Z'), TZ)).toBe(false); // 23:59:59
    expect(isEntryOverdue(task, at('2026-09-18T17:00:00Z'), TZ)).toBe(true); // 00:00 วันถัดไป
  });

  it('งานมีเวลา: เลยเมื่อเลยเวลานั้น', () => {
    const task = { occurredAt: at('2026-09-18T07:00:00Z'), isAllDay: false, status: 'active' };
    expect(isEntryOverdue(task, at('2026-09-18T06:59:00Z'), TZ)).toBe(false);
    expect(isEntryOverdue(task, at('2026-09-18T07:01:00Z'), TZ)).toBe(true);
  });

  it('เสร็จ / ยกเลิก / ข้าม / ไม่มีกำหนด = ไม่เลยกำหนด', () => {
    const late = at('2026-09-30T00:00:00Z');
    for (const status of ['done', 'cancelled', 'skipped']) {
      expect(isEntryOverdue({ occurredAt: dueToday, isAllDay: true, status }, late, TZ)).toBe(
        false,
      );
    }
    expect(isEntryOverdue({ occurredAt: null, isAllDay: true, status: 'pending' }, late, TZ)).toBe(
      false,
    );
  });
});

describe('monthBoundsInTimeZone', () => {
  it('ต้นเดือนตามเวลาไทย = 17:00 UTC ของวันสุดท้ายเดือนก่อน', () => {
    // 2026-08-31 18:00Z = 1 ก.ย. 01:00 ตามเวลาไทย → นับเป็นเดือนกันยายน
    const b = monthBoundsInTimeZone(new Date('2026-08-31T18:00:00Z'), 'Asia/Bangkok');
    expect(b.period).toBe('2026-09');
    expect(b.start.toISOString()).toBe('2026-08-31T17:00:00.000Z');
    expect(b.end.toISOString()).toBe('2026-09-30T17:00:00.000Z');
    expect(b.daysInMonth).toBe(30);
  });

  it('ข้ามปี และกุมภาพันธ์ปีอธิกสุรทิน', () => {
    expect(periodBounds('2026-12', 'UTC').end.toISOString()).toBe('2027-01-01T00:00:00.000Z');
    expect(periodBounds('2028-02', 'UTC').daysInMonth).toBe(29);
  });

  it('เดือนที่มี DST ยาวไม่เท่า 24×จำนวนวัน แต่ขอบยังเป็นเที่ยงคืนท้องถิ่น', () => {
    const b = periodBounds('2026-03', 'America/New_York');
    expect(b.start.toISOString()).toBe('2026-03-01T05:00:00.000Z'); // EST
    expect(b.end.toISOString()).toBe('2026-04-01T04:00:00.000Z'); // EDT
  });
});

describe('periodBounds', () => {
  it('เลื่อนย้อนหลังข้ามปี', () => {
    expect(periodBounds('2026-02', 'UTC', -3).period).toBe('2025-11');
    expect(periodBounds('2026-11', 'UTC', 2).period).toBe('2027-01');
  });

  it('รูปแบบผิด → RangeError', () => {
    expect(() => periodBounds('2026-13', 'UTC')).toThrow(RangeError);
    expect(() => periodBounds('2026-8', 'UTC')).toThrow(RangeError);
  });
});

describe('greetingFor (ใช้ทั้ง API และเว็บ)', () => {
  it('เช้า < 12:00 ≤ บ่าย < 18:00 ≤ เย็น ตามโซนของผู้ใช้', () => {
    // 05:00Z = 12:00 ที่กรุงเทพ
    expect(greetingFor(new Date('2026-10-17T04:59:00Z'), 'Asia/Bangkok', 'Jay')).toBe(
      'สวัสดีตอนเช้า Jay',
    );
    expect(greetingFor(new Date('2026-10-17T05:00:00Z'), 'Asia/Bangkok', 'Jay')).toBe(
      'สวัสดีตอนบ่าย Jay',
    );
    expect(greetingFor(new Date('2026-10-17T11:00:00Z'), 'Asia/Bangkok', '')).toBe('สวัสดีตอนเย็น');
  });
});
