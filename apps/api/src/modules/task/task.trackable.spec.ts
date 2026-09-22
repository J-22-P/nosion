import { type Entry, type UserContext } from '@nosion/core';
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
      expect(widget.headline).toBe('1/3 งาน');
      expect(widget.subline).toBe('เลยกำหนด 1 รายการ');
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
    it('จับคำว่า "พรุ่งนี้" เป็นกำหนดส่งวันถัดไป', () => {
      const parsed = module.parseNaturalLanguage('ส่งรายงานพรุ่งนี้', ctx);
      expect(parsed?.occurredAt?.toISOString()).toBe('2026-09-19T03:00:00.000Z');
      expect(parsed?.matchedTokens).toContain('พรุ่งนี้');
    });

    it('คำว่า "ด่วน" ดัน priority ขึ้นเป็น high', () => {
      expect(module.parseNaturalLanguage('งานด่วน', ctx)?.priority).toBe('high');
    });

    it('ข้อความลงท้ายด้วยจำนวนเงิน → คืน null ให้โมดูลอื่นรับไป', () => {
      expect(module.parseNaturalLanguage('กาแฟ 65', ctx)).toBeNull();
    });

    it('ข้อความว่าง → null', () => {
      expect(module.parseNaturalLanguage('   ', ctx)).toBeNull();
    });

    it('payload ที่คืนมาผ่าน schema ของโมดูลเสมอ', () => {
      const parsed = module.parseNaturalLanguage('เตรียมสไลด์วันนี้', ctx);
      expect(module.payloadSchema.safeParse(parsed?.payload).success).toBe(true);
    });
  });
});
