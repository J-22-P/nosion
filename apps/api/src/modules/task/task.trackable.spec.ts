import { parseNaturalText, type Entry, type UserContext } from '@nosion/core';
import { nlContextOf } from '../../core/parser/parser.service';
import { beforeEach, describe, expect, it } from 'vitest';
import { TaskTrackableModule } from './task.trackable';

const ctx: UserContext = {
  userId: 'u1',
  timezone: 'Asia/Bangkok',
  locale: 'th',
  currency: 'THB',
  weekStartsOn: 1,
  enabledModules: ['task'],
  now: new Date('2026-09-18T03:00:00Z'),
};

const entry = (over: Partial<Entry> = {}): Entry => ({
  id: 'e1',
  userId: 'u1',
  module: 'task',
  title: 'งานทดสอบ',
  description: null,
  status: 'pending',
  priority: 'none',
  occurredAt: new Date('2026-09-18T03:00:00Z'),
  isAllDay: true,
  completedAt: null,
  payload: {
    estimateMinutes: 60,
    actualMinutes: 0,
    checklist: [],
    github: null,
    branchName: null,
    deferCount: 0,
  },
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
});

describe('TaskTrackableModule', () => {
  let module: TaskTrackableModule;

  beforeEach(() => {
    module = new TaskTrackableModule();
  });

  describe('toCalendarEvent', () => {
    it('งานที่ไม่มีกำหนดส่ง ไม่ควรไปโผล่บนปฏิทิน', () => {
      expect(module.toCalendarEvent(entry({ occurredAt: null }))).toBeNull();
    });

    it('งานที่มีกำหนดส่ง → event พร้อมสีประจำโมดูล', () => {
      const event = module.toCalendarEvent(entry());
      expect(event).toMatchObject({ module: 'task', color: '#6366f1', allDay: true });
    });
  });

  describe('summarizeToday', () => {
    it('นับงานที่เสร็จและงานที่เลยกำหนดแยกกัน', () => {
      const widget = module.summarizeToday(
        [
          entry({ id: 'a', status: 'done' }),
          entry({ id: 'b', occurredAt: new Date('2026-09-15T03:00:00Z') }),
          entry({ id: 'c' }),
        ],
        ctx,
      );
      // สเปก 7.4: "งานวันนี้ 4 ชิ้น · เลยกำหนด 1" + progress done/total + ปุ่ม standup
      expect(widget.headline).toBe('งานวันนี้ 3 ชิ้น · เลยกำหนด 1');
      expect(widget.subline).toBe('เสร็จแล้ว 1/3');
      expect(widget.progress).toEqual({ done: 1, total: 3 });
      expect(widget.actions?.[0]?.label).toBe('สร้าง standup');
      // mockup 8.11.1: งานที่เสร็จวันนี้ยังอยู่ในการ์ด (ขีดฆ่า) แต่อยู่ท้ายสุด
      expect(widget.items.map((i) => [i.entryId, i.status])).toEqual([
        ['b', 'pending'],
        ['c', 'pending'],
        ['a', 'done'],
      ]);
      expect(widget.isEmpty).toBe(false);
    });

    it('ไม่มีงานเลย → empty state พร้อม CTA (ไม่ใช่ widget ว่างเปล่า)', () => {
      const widget = module.summarizeToday([], ctx);
      expect(widget.isEmpty).toBe(true);
      expect(widget.emptyCta?.label).toBe('เพิ่มงานแรก');
    });
  });

  describe('summarizeWeek', () => {
    it('ชี้งานที่ถูกผัดบ่อยที่สุด', () => {
      const section = module.summarizeWeek(
        [
          entry({
            id: 'a',
            title: 'งานผัดบ่อย',
            payload: {
              deferCount: 4,
              estimateMinutes: 60,
              actualMinutes: 0,
              checklist: [],
              github: null,
              branchName: null,
            },
          }),
          entry({ id: 'b', status: 'done' }),
        ],
        ctx,
      );
      expect(section.highlights.join(' ')).toContain('งานผัดบ่อย');
      expect(section.stats[0]).toEqual({ label: 'ทำเสร็จ', value: '1/2' });
    });
  });

  describe('parseNaturalLanguage', () => {
    const parse = (input: string) =>
      module.parseNaturalLanguage(parseNaturalText(input, nlContextOf(ctx)), ctx);

    it('"พรุ่งนี้" = ทั้งวันของพรุ่งนี้ตามโซนผู้ใช้ (ไม่ใช่ตอนนี้ + 24 ชม.)', () => {
      const parsed = parse('ส่งรายงานพรุ่งนี้');
      expect(parsed?.title).toBe('ส่งรายงาน');
      expect(parsed?.occurredAt?.toISOString()).toBe('2026-09-18T17:00:00.000Z');
      expect(parsed?.isAllDay).toBe(true);
      expect(parsed?.matchedTokens).toContain('พรุ่งนี้');
      expect(parsed?.reminders).toEqual([]);
    });

    it('ระบุเวลา → เตือนตอนนั้น · ระยะเวลา → estimateMinutes', () => {
      const parsed = parse('ประชุม พรุ่งนี้ 5 โมง 45 นาที !high');
      expect(parsed?.occurredAt?.toISOString()).toBe('2026-09-19T10:00:00.000Z');
      expect(parsed?.priority).toBe('high');
      expect(parsed?.payload).toMatchObject({ estimateMinutes: 45 });
      expect(parsed?.reminders).toEqual([{ channel: 'push', offsetMinutes: 0 }]);
    });

    it('คำว่า "ด่วน" ดัน priority ขึ้นเป็น high', () => {
      expect(parse('งานด่วน')?.priority).toBe('high');
    });

    it('ข้อความแบบรายจ่าย → ยังเป็นงานได้ แต่ความมั่นใจต่ำ และชื่อเก็บตัวเลขไว้', () => {
      const parsed = parse('กาแฟ 65');
      expect(parsed?.title).toBe('กาแฟ 65');
      expect(parsed?.confidence).toBeLessThanOrEqual(0.25);
    });

    it('การเกิดซ้ำส่งต่อเป็น rrule', () => {
      expect(parse('standup ทุกวันธรรมดา 10 โมง')?.rrule).toBe('FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR');
    });

    it('ข้อความว่าง → null', () => {
      expect(parse('   ')).toBeNull();
    });

    it('payload ที่คืนมาผ่าน schema ของโมดูลเสมอ', () => {
      const parsed = parse('เตรียมสไลด์วันนี้');
      expect(module.payloadSchema.safeParse(parsed?.payload).success).toBe(true);
    });
  });
});
