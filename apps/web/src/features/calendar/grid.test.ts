import type { CalendarEventDto } from '@nosion/contracts';
import { describe, expect, it } from 'vitest';
import {
  canMove,
  isoWeek,
  longDayLabel,
  monthGridDays,
  monthTitle,
  moveTarget,
  shiftAnchor,
  timeOf,
  viewRange,
  weekDays,
  weekRangeLabel,
  weekSnapshot,
} from './grid';

const event = (over: Partial<CalendarEventDto>): CalendarEventDto => ({
  id: 'x',
  entryId: 'x',
  ruleId: null,
  version: 1,
  module: 'task',
  title: 't',
  start: '2026-10-20T03:00:00.000Z',
  end: null,
  allDay: false,
  date: '2026-10-20',
  status: 'pending',
  color: '#000',
  projected: false,
  hasReminder: false,
  actions: [],
  meta: {},
  ...over,
});

describe('grid', () => {
  it('grid เดือน 42 วัน เริ่มต้นสัปดาห์ที่มีวันที่ 1 (จันทร์/อาทิตย์)', () => {
    // 1 ต.ค. 2026 = วันพฤหัส
    const monday = monthGridDays('2026-10-16', 1);
    expect(monday).toHaveLength(42);
    expect(monday[0]).toBe('2026-09-28');
    expect(monday.at(-1)).toBe('2026-11-08');
    expect(monthGridDays('2026-10-16', 0)[0]).toBe('2026-09-27');
  });

  it('week = 7 วันของสัปดาห์ที่มี anchor · month กับ agenda ขอช่วงเดียวกัน', () => {
    expect(weekDays('2026-10-16', 1)).toEqual([
      '2026-10-12',
      '2026-10-13',
      '2026-10-14',
      '2026-10-15',
      '2026-10-16',
      '2026-10-17',
      '2026-10-18',
    ]);
    expect(viewRange('agenda', '2026-10-16', 1)).toEqual(viewRange('month', '2026-10-16', 1));
    expect(viewRange('week', '2026-10-16', 1)).toMatchObject({
      from: '2026-10-12',
      to: '2026-10-18',
    });
  });

  it('เลื่อน: เดือนไปวันที่ 1 (ข้ามปีได้) · สัปดาห์ทีละ 7 วัน', () => {
    expect(shiftAnchor('month', '2026-12-31', 1)).toBe('2027-01-01');
    expect(shiftAnchor('agenda', '2026-01-15', -1)).toBe('2025-12-01');
    expect(shiftAnchor('week', '2026-10-16', -1)).toBe('2026-10-09');
  });

  it('สัปดาห์ ISO รวมกรณีข้ามปี', () => {
    expect(isoWeek('2026-10-16')).toBe(42);
    expect(isoWeek('2026-12-31')).toBe(53);
    expect(isoWeek('2027-01-01')).toBe(53);
    expect(isoWeek('2027-01-04')).toBe(1);
    expect(weekRangeLabel(monthGridDays('2026-10-01', 1))).toBe('W40 – W45');
  });

  it('ป้ายภาษาไทย + เวลาตามโซนผู้ใช้', () => {
    expect(monthTitle('2026-08-12')).toBe('สิงหาคม 2026');
    expect(longDayLabel('2026-08-12')).toBe('วันพุธ 12 สิงหาคม 2026');
    expect(timeOf('2026-10-20T03:00:00.000Z', 'Asia/Bangkok')).toBe('10:00');
  });

  it('Quick Snapshot: งานเสร็จ/ทั้งหมดของสัปดาห์ · บิลค้างจ่าย · บิลถัดไปอีกกี่วัน', () => {
    const week = weekDays('2026-10-16', 1);
    const snap = weekSnapshot(
      [
        event({ date: '2026-10-15', status: 'done' }),
        event({ date: '2026-10-16' }),
        event({ date: '2026-10-25' }), // นอกสัปดาห์
        event({
          module: 'expense',
          date: '2026-10-14',
          status: 'done',
          meta: { amountMinor: 50000, currency: 'THB' },
        }),
        event({
          module: 'expense',
          date: '2026-10-18',
          meta: { amountMinor: 79900, currency: 'THB' },
        }),
        event({
          module: 'expense',
          date: '2026-10-30',
          meta: { amountMinor: 1000, currency: 'THB' },
        }),
      ],
      week,
      '2026-10-16',
    );
    expect(snap).toEqual({
      tasksDone: 1,
      tasksTotal: 2,
      dueMinor: 79900,
      currency: 'THB',
      nextDueInDays: 2,
    });
  });

  it('ย้ายวัน: ทั้งวันส่งวันที่ล้วน · มีเวลาคงเวลาหน้าปัด (ข้าม DST ของ New York)', () => {
    expect(
      moveTarget(event({ allDay: true, date: '2026-10-20' }), '2026-10-22', 'Asia/Bangkok'),
    ).toEqual({
      occurredAt: '2026-10-22',
      start: '2026-10-21T17:00:00.000Z',
    });
    expect(moveTarget(event({}), '2026-10-23', 'Asia/Bangkok')).toEqual({
      occurredAt: '2026-10-23T03:00:00.000Z',
      start: '2026-10-23T03:00:00.000Z',
    });
    // 09:00 New York ก่อน DST สิ้นสุด (EDT, UTC−4) → หลัง (EST, UTC−5) ยังเป็น 09:00
    const ny = event({ start: '2026-10-30T13:00:00.000Z', date: '2026-10-30' });
    expect(moveTarget(ny, '2026-11-02', 'America/New_York')?.occurredAt).toBe(
      '2026-11-02T14:00:00.000Z',
    );
    expect(moveTarget(event({}), '2026-10-20', 'Asia/Bangkok')).toBeNull();
  });

  it('ย้ายได้เฉพาะ entry จริงที่ยังไม่เสร็จ', () => {
    expect(canMove(event({}))).toBe(true);
    expect(canMove(event({ status: 'done' }))).toBe(false);
    expect(canMove(event({ entryId: null, version: null, projected: true }))).toBe(false);
  });
});
