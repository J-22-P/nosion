import type { ModuleKey } from '@nosion/contracts';
import type { NlResult, ParsedEntry, TrackableModule, UserContext } from '@nosion/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ModuleRegistryService } from '../registry/module-registry.service';
import { ParserService } from './parser.service';

const ctx: UserContext = {
  userId: 'u1',
  timezone: 'Asia/Bangkok',
  locale: 'th',
  currency: 'THB',
  weekStartsOn: 1,
  enabledModules: ['task', 'expense', 'habit'],
  now: new Date('2026-10-16T03:00:00Z'),
};

/** โมดูลปลอมที่ตอบความมั่นใจตามที่กำหนด — ทดสอบการจัดอันดับโดยไม่ผูกกับ heuristic จริง */
function fake(
  key: ModuleKey,
  decide: (text: NlResult) => number | null,
): TrackableModule<unknown> & { seen: NlResult[] } {
  const seen: NlResult[] = [];
  return {
    key,
    seen,
    meta: { label: { th: key, en: key }, icon: 'x', color: '#000' },
    payloadSchema: z.object({}),
    supportsRecurrence: false,
    supportsReminder: false,
    toCalendarEvent: () => null,
    summarizeToday: () => ({
      module: key,
      title: key,
      order: 0,
      headline: '',
      items: [],
      isEmpty: true,
    }),
    summarizeWeek: () => ({ module: key, title: key, order: 0, stats: [], highlights: [] }),
    parseNaturalLanguage(text): ParsedEntry | null {
      seen.push(text);
      const confidence = decide(text);
      if (confidence === null) return null;
      return {
        module: key,
        title: text.title,
        occurredAt: null,
        isAllDay: true,
        payload: {},
        confidence,
      };
    },
  };
}

describe('ParserService', () => {
  let registry: ModuleRegistryService;

  beforeEach(() => {
    registry = new ModuleRegistryService();
  });

  it('เรียงตามความมั่นใจ · ตัวแรก = best · ทางเลือกไม่เกิน 2', () => {
    registry.registerAll([
      fake('task', () => 0.2),
      fake('expense', () => 0.9),
      fake('habit', () => 0.5),
      fake('workout', () => 0.1),
    ]);
    const out = new ParserService(registry).parse('กาแฟ 65', {
      ...ctx,
      enabledModules: ['task', 'expense', 'habit', 'workout'],
    });
    expect(out.best?.module).toBe('expense');
    expect(out.alternatives.map((a) => a.module)).toEqual(['habit', 'task']);
  });

  it('แยกชิ้นครั้งเดียว แล้วส่งผลเดียวกันให้ทุกโมดูล', () => {
    const task = fake('task', () => 0.4);
    const expense = fake('expense', () => null);
    registry.registerAll([task, expense]);
    const out = new ParserService(registry).parse('ค่าเน็ต 799 ทุกวันที่ 5 #บ้าน', ctx);
    expect(task.seen[0]).toBe(expense.seen[0]);
    expect(out.text.rrule).toBe('FREQ=MONTHLY;BYMONTHDAY=5');
    expect(out.text.tags).toEqual(['บ้าน']);
  });

  it('โมดูลที่ผู้ใช้ปิดไว้ไม่ถูกถาม · ไม่มีใครรับ = best null', () => {
    const habit = fake('habit', () => 0.9);
    registry.registerAll([fake('task', () => null), habit]);
    const out = new ParserService(registry).parse('ดื่มน้ำ', { ...ctx, enabledModules: ['task'] });
    expect(habit.seen).toHaveLength(0);
    expect(out.best).toBeNull();
  });
});
