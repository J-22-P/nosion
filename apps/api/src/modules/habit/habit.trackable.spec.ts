import type { HabitPayload } from '@nosion/contracts';
import { parseNaturalText, type Entry, type UserContext } from '@nosion/core';
import { describe, expect, it } from 'vitest';
import { nlContextOf } from '../../core/parser/parser.service';
import { TaskTrackableModule } from '../task/task.trackable';
import { HabitTrackableModule } from './habit.trackable';

const ctx: UserContext = {
  userId: 'u1',
  timezone: 'Asia/Bangkok',
  locale: 'th',
  currency: 'THB',
  weekStartsOn: 1,
  enabledModules: ['task', 'expense', 'habit'],
  now: new Date('2026-10-16T03:00:00Z'), // ศุกร์ 10:00
};

const habit = new HabitTrackableModule();
const task = new TaskTrackableModule();
const nl = (input: string) => parseNaturalText(input, nlContextOf(ctx));

const entry = (payload: Partial<HabitPayload>, over: Partial<Entry> = {}): Entry => ({
  id: 'h1',
  userId: 'u1',
  module: 'habit',
  title: 'ดื่มน้ำ',
  description: null,
  status: 'pending',
  priority: 'none',
  occurredAt: new Date('2026-10-15T17:00:00Z'), // 16 ต.ค. 00:00 ไทย
  isAllDay: true,
  completedAt: null,
  payload: habit.payloadSchema.parse({ kind: 'count', targetValue: 8, unit: 'แก้ว', ...payload }),
  projectId: null,
  parentId: null,
  recurrenceRuleId: 'r1',
  recurrenceSlot: null,
  sortOrder: 0,
  clientId: null,
  version: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
  ...over,
});

describe('HabitTrackableModule.parseNaturalLanguage', () => {
  it('สเปก 6.4: "ดื่มน้ำ 8 แก้ว ทุกวัน" → นับ 8 แก้ว รายวัน · ชนะงาน', () => {
    const text = nl('ดื่มน้ำ 8 แก้ว ทุกวัน');
    const h = habit.parseNaturalLanguage(text, ctx)!;
    expect(h).toMatchObject({
      title: 'ดื่มน้ำ',
      rrule: 'FREQ=DAILY',
      isAllDay: true,
      payload: { kind: 'count', targetValue: 8, unit: 'แก้ว', cadence: 'daily' },
    });
    expect(h.occurredAt?.toISOString()).toBe('2026-10-15T17:00:00.000Z'); // เที่ยงคืนวันนี้ตามเวลาไทย
    expect(h.confidence).toBeGreaterThan(task.parseNaturalLanguage(text, ctx)!.confidence);
  });

  it('"นอนก่อน 23:45 ทุกวัน" → before_time · รอบแรกเป็นทั้งวัน ไม่ใช่ 23:45', () => {
    const h = habit.parseNaturalLanguage(nl('นอนก่อน 23:45 ทุกวัน'), ctx)!;
    expect(h).toMatchObject({
      title: 'นอน',
      payload: { kind: 'before_time', deadlineLocalTime: '23:45', targetValue: 1 },
    });
    expect(h.occurredAt?.toISOString()).toBe('2026-10-15T17:00:00.000Z');
  });

  it('"วิ่ง 3 ครั้งต่อสัปดาห์" → weekly เป้า 3 · "อ่านหนังสือ ทุกวัน" → check', () => {
    expect(habit.parseNaturalLanguage(nl('วิ่ง 3 ครั้งต่อสัปดาห์'), ctx)).toMatchObject({
      title: 'วิ่ง',
      payload: { kind: 'check', cadence: 'weekly', weeklyTarget: 3 },
    });
    expect(habit.parseNaturalLanguage(nl('อ่านหนังสือ ทุกวัน'), ctx)).toMatchObject({
      payload: { kind: 'check', cadence: 'daily' },
    });
  });

  it('งานที่มีเวลานัดยังเป็นงาน · มีเงิน = ไม่ใช่นิสัย', () => {
    const standup = nl('standup ทุกวันธรรมดา 10 โมง');
    expect(task.parseNaturalLanguage(standup, ctx)!.confidence).toBeGreaterThan(
      habit.parseNaturalLanguage(standup, ctx)!.confidence,
    );
    expect(habit.parseNaturalLanguage(nl('ค่าเน็ต 799 ทุกวันที่ 5'), ctx)).toBeNull();
  });
});

describe('HabitTrackableModule — Today / ปฏิทิน / สัปดาห์', () => {
  it('การ์ด Today: เฉพาะรอบวันนี้ · "ทำแล้ว 1 จาก 2" · ข้อมูลให้เว็บวาดปุ่ม', () => {
    const w = habit.summarizeToday(
      [
        entry({ currentValue: 8 }),
        entry({ kind: 'check', targetValue: 1, unit: 'ครั้ง' }, { id: 'h2', title: 'อ่านหนังสือ' }),
        entry({ currentValue: 2 }, { id: 'old', occurredAt: new Date('2026-10-14T17:00:00Z') }), // เมื่อวาน
      ],
      ctx,
    );
    expect(w.headline).toBe('ทำแล้ว 1 จาก 2');
    expect(w.progress).toEqual({ done: 1, total: 2 });
    expect(
      (w.data!.habits as { entryId: string; done: boolean }[]).map((h) => [h.entryId, h.done]),
    ).toEqual([
      ['h1', true],
      ['h2', false],
    ]);
  });

  it('ปฏิทิน: นับจำนวน → ลิงก์ไปหน้านิสัย · check → checkbox · ครบแล้วไม่มีปุ่ม', () => {
    expect(habit.toCalendarEvent(entry({ currentValue: 5 }))).toMatchObject({
      title: 'ดื่มน้ำ 5/8 แก้ว',
      allDay: true,
      meta: { progress: { current: 5, target: 8, unit: 'แก้ว' } },
    });
    expect(habit.calendarActions(entry({ currentValue: 5 }))).toEqual([
      { kind: 'open', label: 'บันทึกจำนวน', href: '/habits' },
    ]);
    expect(habit.calendarActions(entry({ kind: 'check', targetValue: 1 }))).toEqual([
      { kind: 'complete', label: 'สำเร็จ', presentation: 'checkbox' },
    ]);
    expect(habit.calendarActions(entry({ currentValue: 8 }))).toEqual([]);
  });

  it('สรุปสัปดาห์: อัตราความสำเร็จ (ข้ามโดยตั้งใจไม่นับ · รอบของวันที่ยังมาไม่ถึงไม่นับ)', () => {
    const s = habit.summarizeWeek(
      [
        entry({ currentValue: 8 }),
        entry({ currentValue: 1 }),
        entry({}, { status: 'skipped' }),
        entry({}, { id: 'tomorrow', occurredAt: new Date('2026-10-16T17:00:00Z') }),
      ],
      ctx,
    );
    expect(s.stats).toEqual([
      { label: 'ทำสำเร็จ', value: '1/2' },
      { label: 'อัตราความสำเร็จ', value: '50%' },
      { label: 'จำนวนนิสัย', value: '1' },
    ]);
  });
});
