import type { ModuleKey } from '@nosion/contracts';
import type { Entry, TrackableModule } from '@nosion/core';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { buildCalendar, type CalendarSource } from './calendar-events';

const TZ = 'Asia/Bangkok';

/** โมดูลปลอม: ขึ้นปฏิทินเฉพาะ entry ที่มีวันที่ · มีปุ่ม complete เมื่อยังไม่เสร็จ */
function fake(key: ModuleKey, withActions = true): TrackableModule<unknown> {
  return {
    key,
    meta: { label: { th: key, en: key }, icon: 'x', color: '#111' },
    payloadSchema: z.object({}),
    supportsRecurrence: false,
    supportsReminder: false,
    toCalendarEvent: (e) =>
      e.occurredAt
        ? {
            id: `${key}:${e.id}`,
            entryId: e.id,
            module: key,
            title: e.title,
            start: e.occurredAt,
            end: null,
            allDay: e.isAllDay,
            firstDay: (e.payload as { firstDay?: string }).firstDay ?? null,
            color: '#111',
            status: e.status,
          }
        : null,
    ...(withActions
      ? {
          calendarActions: (e: Entry) =>
            e.status === 'done'
              ? []
              : [{ kind: 'complete' as const, label: 'เสร็จ', presentation: 'checkbox' as const }],
        }
      : {}),
    summarizeToday: () => ({
      module: key,
      title: key,
      order: 0,
      headline: '',
      items: [],
      isEmpty: true,
    }),
    summarizeWeek: () => ({ module: key, title: key, order: 0, stats: [], highlights: [] }),
    parseNaturalLanguage: () => null,
  };
}

let seq = 0;
function source(
  over: Partial<Entry> & { module: ModuleKey },
  extra: Partial<CalendarSource> = {},
): CalendarSource {
  const entry: Entry = {
    id: `e${++seq}`,
    userId: 'u1',
    title: 'รายการ',
    description: null,
    status: 'pending',
    priority: 'none',
    occurredAt: new Date('2026-10-20T03:00:00Z'),
    isAllDay: false,
    completedAt: null,
    payload: {},
    projectId: null,
    parentId: null,
    recurrenceRuleId: null,
    recurrenceSlot: null,
    sortOrder: 0,
    clientId: null,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...over,
  };
  return { entry, projected: false, reminders: [], ...extra };
}

describe('buildCalendar', () => {
  const modules = [fake('task'), fake('expense', false)];

  it('วันที่ของ cell ตามโซนผู้ใช้ — 20:00 UTC ของวันที่ 20 = วันที่ 21 ที่ไทย', () => {
    const { events } = buildCalendar(
      [source({ module: 'task', occurredAt: new Date('2026-10-20T20:00:00Z') })],
      modules,
      TZ,
    );
    expect(events[0]?.date).toBe('2026-10-21');
  });

  it('หลายวัน: date = วันแรก · endDate = วันของ start · วันแรกไม่ก่อนวันสุดท้าย = วันเดียว', () => {
    const { events } = buildCalendar(
      [
        source({ module: 'task', payload: { firstDay: '2026-10-14' } }),
        source({ module: 'task', payload: { firstDay: '2026-10-25' } }),
      ],
      modules,
      TZ,
    );
    expect(events.map((e) => [e.date, e.endDate])).toEqual([
      ['2026-10-14', '2026-10-20'],
      ['2026-10-20', null],
    ]);
  });

  it('range: ตัดรายการที่ไม่ทับช่วงทิ้ง (ไม่นับใน countsByModule) · แถบที่เริ่มก่อนช่วงยังอยู่', () => {
    const { events, countsByModule } = buildCalendar(
      [
        source({ module: 'task', title: 'คร่อมต้นช่วง', payload: { firstDay: '2026-10-10' } }),
        source({
          module: 'task',
          title: 'จบก่อนช่วง',
          occurredAt: new Date('2026-10-12T03:00:00Z'),
        }),
      ],
      modules,
      TZ,
      undefined,
      { from: '2026-10-19', to: '2026-10-25' },
    );
    expect(events.map((e) => e.title)).toEqual(['คร่อมต้นช่วง']);
    expect(countsByModule.task).toBe(1);
  });

  it('เรียงตามวัน → ทั้งวันก่อน → เวลาเริ่ม', () => {
    const { events } = buildCalendar(
      [
        source({ module: 'task', title: 'บ่าย', occurredAt: new Date('2026-10-20T07:00:00Z') }),
        source({
          module: 'task',
          title: 'ทั้งวัน',
          isAllDay: true,
          occurredAt: new Date('2026-10-19T17:00:00Z'),
        }),
        source({ module: 'task', title: 'เช้า', occurredAt: new Date('2026-10-20T02:00:00Z') }),
        source({ module: 'task', title: 'เมื่อวาน', occurredAt: new Date('2026-10-19T02:00:00Z') }),
      ],
      modules,
      TZ,
    );
    expect(events.map((e) => e.title)).toEqual(['เมื่อวาน', 'ทั้งวัน', 'เช้า', 'บ่าย']);
  });

  it('filter กรองเฉพาะ events — countsByModule ยังนับทุกโมดูล (มี 0 ด้วย)', () => {
    const built = buildCalendar(
      [
        source({ module: 'task' }),
        source({ module: 'task' }),
        source({ module: 'task', occurredAt: null }),
      ],
      [...modules, fake('habit')],
      TZ,
      ['expense'],
    );
    expect(built.events).toHaveLength(0);
    expect(built.countsByModule).toEqual({ task: 2, expense: 0, habit: 0 });
  });

  it('โมดูลที่ปิด/ไม่รู้จักถูกข้าม · ปุ่มมาจาก calendarActions ของโมดูล ไม่มี = []', () => {
    const { events } = buildCalendar(
      [
        source({ module: 'task' }),
        source({ module: 'task', status: 'done' }),
        source({ module: 'expense' }),
        source({ module: 'workout' }),
      ],
      modules,
      TZ,
    );
    expect(events.map((e) => [e.module, e.actions.length])).toEqual([
      ['task', 1],
      ['task', 0],
      ['expense', 0],
    ]);
  });

  it('รอบ projected: ไม่มี entryId ไม่มีปุ่ม แต่บอก ruleId', () => {
    const { events } = buildCalendar(
      [
        source(
          { module: 'task', id: 'projected:r1:1', recurrenceRuleId: 'r1' },
          { projected: true },
        ),
      ],
      modules,
      TZ,
    );
    expect(events[0]).toMatchObject({
      entryId: null,
      ruleId: 'r1',
      version: null,
      projected: true,
      actions: [],
    });
  });

  it('การเตือนที่ยกเลิกไม่นับ · วันที่ของการเตือนคือวันที่ยิง ไม่ใช่วันของรายการ', () => {
    const built = buildCalendar(
      [
        source(
          {
            module: 'task',
            id: 'bill',
            isAllDay: true,
            occurredAt: new Date('2026-11-04T17:00:00Z'),
          },
          {
            reminders: [
              { fireAt: new Date('2026-11-04T02:00:00Z'), channel: 'push', status: 'sent' },
              { fireAt: new Date('2026-11-03T02:00:00Z'), channel: 'email', status: 'cancelled' },
            ],
          },
        ),
      ],
      modules,
      TZ,
    );
    expect(built.events[0]?.hasReminder).toBe(true);
    expect(built.reminders).toEqual([
      {
        entryId: 'bill',
        date: '2026-11-04',
        fireAt: '2026-11-04T02:00:00.000Z',
        channel: 'push',
        status: 'sent',
      },
    ]);
  });
});
