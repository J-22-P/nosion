import { describe, expect, it } from 'vitest';
import { taskRanges } from './task-ranges';

describe('taskRanges', () => {
  it('Asia/Bangkok: ขอบวันเป็นเที่ยงคืนเวลาไทย (17:00 UTC ของวันก่อน)', () => {
    const r = taskRanges(new Date('2026-09-30T08:00:00Z'), 'Asia/Bangkok');
    expect(r.todayStart.toISOString()).toBe('2026-09-29T17:00:00.000Z');
    expect(r.todayEnd.toISOString()).toBe('2026-09-30T17:00:00.000Z');
    expect(r.weekEnd.toISOString()).toBe('2026-10-06T17:00:00.000Z');
  });

  it('ช่วงหลังเที่ยงคืนไทยแต่ยังเป็นวันก่อนใน UTC ต้องนับเป็น "วันนี้" ของไทย', () => {
    const r = taskRanges(new Date('2026-09-30T18:30:00Z'), 'Asia/Bangkok'); // 01:30 1 ต.ค. เวลาไทย
    expect(r.todayStart.toISOString()).toBe('2026-09-30T17:00:00.000Z');
  });

  it('ข้าม DST (America/New_York 1 พ.ย. 2026) ยังได้ 7 วันปฏิทินพอดี', () => {
    const r = taskRanges(new Date('2026-10-28T16:00:00Z'), 'America/New_York');
    expect(r.todayStart.toISOString()).toBe('2026-10-28T04:00:00.000Z'); // EDT
    expect(r.weekEnd.toISOString()).toBe('2026-11-04T05:00:00.000Z'); // EST
  });
});
