import { describe, expect, it } from 'vitest';
import {
  dayBoundsInTimeZone,
  formatInTimeZone,
  isOverdue,
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

describe('isOverdue', () => {
  const now = new Date('2026-09-18T10:00:00Z');
  it('เลยกำหนดและยังไม่เสร็จ = true', () => {
    expect(isOverdue(new Date('2026-09-17T10:00:00Z'), now, false)).toBe(true);
  });
  it('เสร็จแล้วไม่นับว่าเลยกำหนด', () => {
    expect(isOverdue(new Date('2026-09-17T10:00:00Z'), now, true)).toBe(false);
  });
  it('ไม่มีกำหนดส่ง = ไม่เลยกำหนด', () => {
    expect(isOverdue(null, now, false)).toBe(false);
  });
});
