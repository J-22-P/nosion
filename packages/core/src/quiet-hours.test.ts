import { describe, expect, it } from 'vitest';
import { isInQuietHours, quietHoursEnd, type QuietHours } from './quiet-hours';

const bangkok: QuietHours = {
  enabled: true,
  start: '22:00',
  end: '07:00',
  timezone: 'Asia/Bangkok',
};
/** เวลาไทย (UTC+7) → Date */
const th = (local: string) => new Date(`${local}+07:00`);

describe('isInQuietHours — ช่วงข้ามเที่ยงคืน 22:00–07:00 เวลาไทย', () => {
  it.each([
    ['2027-01-10T21:59', false],
    ['2027-01-10T22:00', true], // ขอบเริ่มนับรวม
    ['2027-01-11T02:30', true],
    ['2027-01-11T06:59', true],
    ['2027-01-11T07:00', false], // ขอบจบไม่นับ
    ['2027-01-11T12:00', false],
  ])('%s → %s', (local, expected) => {
    expect(isInQuietHours(th(local), bangkok)).toBe(expected);
  });

  it('ปิดใช้งาน หรือ start = end → ไม่มีช่วงห้าม', () => {
    expect(isInQuietHours(th('2027-01-11T02:30'), { ...bangkok, enabled: false })).toBe(false);
    expect(isInQuietHours(th('2027-01-11T02:30'), { ...bangkok, end: '22:00' })).toBe(false);
  });

  it('ช่วงไม่ข้ามเที่ยงคืน (13:00–14:00)', () => {
    const lunch = { ...bangkok, start: '13:00', end: '14:00' };
    expect(isInQuietHours(th('2027-01-11T13:30'), lunch)).toBe(true);
    expect(isInQuietHours(th('2027-01-11T23:30'), lunch)).toBe(false);
  });

  it('ใช้หน้าปัดของโซนผู้ใช้ ไม่ใช่ UTC', () => {
    // 16:00 UTC = 23:00 ไทย (ห้าม) แต่ = 11:00 นิวยอร์ก (ไม่ห้าม)
    const at = new Date('2027-01-11T16:00:00Z');
    expect(isInQuietHours(at, bangkok)).toBe(true);
    expect(isInQuietHours(at, { ...bangkok, timezone: 'America/New_York' })).toBe(false);
  });
});

describe('quietHoursEnd', () => {
  it('ก่อนเที่ยงคืน → 07:00 ของวันรุ่งขึ้น', () => {
    expect(quietHoursEnd(th('2027-01-10T23:15'), bangkok).toISOString()).toBe(
      th('2027-01-11T07:00').toISOString(),
    );
  });

  it('หลังเที่ยงคืน → 07:00 ของวันเดียวกัน', () => {
    expect(quietHoursEnd(th('2027-01-11T03:00'), bangkok).toISOString()).toBe(
      th('2027-01-11T07:00').toISOString(),
    );
  });

  it('ข้ามสิ้นเดือน/สิ้นปี', () => {
    expect(quietHoursEnd(th('2027-12-31T23:00'), bangkok).toISOString()).toBe(
      th('2028-01-01T07:00').toISOString(),
    );
  });

  it('คืนที่เข้า DST ของนิวยอร์ก — 07:00 หน้าปัดยังถูก (11:00 UTC แทน 12:00)', () => {
    const ny = { ...bangkok, timezone: 'America/New_York' };
    // 13 มี.ค. 2027 23:00 EST → จบ 14 มี.ค. 07:00 EDT
    expect(quietHoursEnd(new Date('2027-03-14T04:00:00Z'), ny).toISOString()).toBe(
      '2027-03-14T11:00:00.000Z',
    );
  });
});
