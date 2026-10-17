import { taskPayloadSchema, type TaskPayload } from '@nosion/contracts';
import {
  isEntryOverdue,
  remainingText,
  type NlResult,
  type CalendarAction,
  type CalendarEvent,
  type Entry,
  type ModuleMeta,
  type ParsedEntry,
  type TodayWidget,
  type TrackableModule,
  type UserContext,
  type WeeklySection,
  text,
} from '@nosion/core';
import { RegisterModule } from '../../core/registry/register-module.decorator';

/** คำที่บอกว่าเป็นงาน ใช้ในโหมดสร้างของ ⌘K */
const TASK_HINTS = ['ทำ', 'งาน', 'ส่ง', 'นัด', 'ประชุม', 'โทร', 'เตรียม', 'todo', 'task'];
const PRIORITY_HINTS: { pattern: RegExp; priority: TodayPriority }[] = [
  { pattern: /ด่วนมาก|urgent/i, priority: 'urgent' },
  { pattern: /ด่วน|สำคัญ/i, priority: 'high' },
];
type TodayPriority = 'none' | 'low' | 'medium' | 'high' | 'urgent';

/**
 * โมดูลแรกของระบบ — เป็นตัวพิสูจน์ว่า TrackableModule ใช้งานได้จริง
 * ไม่มีโค้ดของ core ไฟล์ไหนรู้จักคลาสนี้เลย: registry ค้นเจอเองผ่าน @RegisterModule()
 */
@RegisterModule()
export class TaskTrackableModule implements TrackableModule<TaskPayload> {
  readonly key = 'task' as const;

  readonly meta: ModuleMeta = {
    label: { th: 'งาน', en: 'Tasks' },
    icon: 'check-square',
    color: '#6366f1',
    description: { th: 'สิ่งที่ต้องทำและกำหนดส่ง', en: 'Things to do and their deadlines' },
  };

  readonly payloadSchema = taskPayloadSchema;
  readonly supportsRecurrence = true;
  readonly supportsReminder = true;

  toCalendarEvent(entry: Entry): CalendarEvent | null {
    if (!entry.occurredAt) return null;
    return {
      id: `task:${entry.id}`,
      entryId: entry.id,
      module: this.key,
      title: entry.title,
      start: entry.occurredAt,
      end: null,
      allDay: entry.isAllDay,
      color: this.meta.color,
      status: entry.status,
      meta: { priority: entry.priority },
    };
  }

  calendarActions(entry: Entry): CalendarAction[] {
    if (entry.status === 'done' || entry.status === 'cancelled') return [];
    return [{ kind: 'complete', label: 'ทำเสร็จ', presentation: 'checkbox' }];
  }

  summarizeToday(entries: Entry[], ctx: UserContext): TodayWidget {
    const now = ctx.now ?? new Date();
    const lang = ctx.locale;
    const done = entries.filter((e) => e.status === 'done').length;
    const overdue = entries.filter((e) => isEntryOverdue(e, now, ctx.timezone));
    const open = entries.filter((e) => e.status !== 'done' && e.status !== 'cancelled');

    return {
      module: this.key,
      title: text(lang, 'task.today.title'),
      order: 10,
      headline:
        text(lang, 'task.today.headline', { count: entries.length }) +
        (overdue.length > 0
          ? text(lang, 'task.today.overdueSuffix', { count: overdue.length })
          : ''),
      subline:
        entries.length > 0
          ? text(lang, 'task.today.subline', { done, total: entries.length })
          : undefined,
      progress: { done, total: entries.length },
      actions: [{ label: text(lang, 'task.today.standup'), href: '/today?standup=1' }],
      data: { overdueCount: overdue.length },
      // ค้างอยู่ก่อน แล้วตามด้วยที่เสร็จวันนี้ (การ์ดแสดงแบบขีดฆ่า — mockup 8.11.1) · รวมไม่เกิน 8
      items: [...open, ...entries.filter((e) => e.status === 'done')].slice(0, 8).map((e) => ({
        entryId: e.id,
        title: e.title,
        status: e.status,
        priority: e.priority,
        occurredAt: e.occurredAt,
        detail: isEntryOverdue(e, now, ctx.timezone) ? text(lang, 'task.today.overdue') : undefined,
      })),
      isEmpty: entries.length === 0,
      emptyCta: { label: text(lang, 'task.today.empty'), href: '/tasks?new=1' },
    };
  }

  summarizeWeek(entries: Entry[], ctx: UserContext): WeeklySection {
    const lang = ctx.locale;
    const done = entries.filter((e) => e.status === 'done');
    const estimated = entries.reduce(
      (sum, e) => sum + ((e.payload as TaskPayload).estimateMinutes ?? 0),
      0,
    );
    const actual = done.reduce(
      (sum, e) => sum + ((e.payload as TaskPayload).actualMinutes ?? 0),
      0,
    );

    const mostDeferred = [...entries]
      .sort(
        (a, b) =>
          ((b.payload as TaskPayload).deferCount ?? 0) -
          ((a.payload as TaskPayload).deferCount ?? 0),
      )
      .at(0);

    const highlights: string[] = [];
    if (done.length > 0) highlights.push(text(lang, 'task.week.closed', { count: done.length }));
    if (mostDeferred && ((mostDeferred.payload as TaskPayload).deferCount ?? 0) > 0) {
      highlights.push(
        text(lang, 'task.week.mostDeferred', {
          title: mostDeferred.title,
          count: (mostDeferred.payload as TaskPayload).deferCount ?? 0,
        }),
      );
    }

    return {
      module: this.key,
      title: text(lang, 'task.week.title'),
      order: 10,
      stats: [
        { label: text(lang, 'task.week.done'), value: `${done.length}/${entries.length}` },
        {
          label: text(lang, 'task.week.estimated'),
          value: text(lang, 'task.week.hours', { n: Math.round(estimated / 60) }),
        },
        {
          label: text(lang, 'task.week.actual'),
          value: text(lang, 'task.week.hours', { n: Math.round(actual / 60) }),
        },
      ],
      highlights,
    };
  }

  /**
   * งานเป็น "ทางเลือกสุดท้าย" ของ ⌘K — ข้อความไหนก็เป็นงานได้ แต่มั่นใจมากขึ้นเมื่อมีวัน/เวลา/priority
   * ตัวเลขเงินและปริมาณเป็นส่วนหนึ่งของชื่องาน ("ซื้อของ 500" = งานชื่อนั้น ถ้าผู้ใช้เลือกสร้างเป็นงาน)
   */
  parseNaturalLanguage(text: NlResult, _ctx: UserContext): ParsedEntry | null {
    const title = remainingText(text, ['amount', 'quantity']);
    if (!title) return null;

    const matched = text.tokens
      .filter((t) => ['date', 'time', 'recurrence', 'priority', 'duration'].includes(t.kind))
      .map((t) => t.raw);
    let confidence = 0.35;
    if (text.date) confidence += 0.2;
    if (text.time) confidence += 0.1;
    if (text.priority) confidence += 0.1;
    if (text.tags.length > 0 || text.project) confidence += 0.05;
    if (TASK_HINTS.some((hint) => title.toLowerCase().includes(hint))) confidence += 0.15;

    let priority: TodayPriority = text.priority ?? 'none';
    if (!text.priority) {
      const hint = PRIORITY_HINTS.find((h) => h.pattern.test(title));
      if (hint) {
        priority = hint.priority;
        confidence += 0.1;
      }
    }

    // มีจำนวนเงินแต่ไม่มีวัน → น่าจะเป็นรายจ่าย ให้ขึ้นเป็นตัวเลือกรอง
    if (text.amount && !text.date) confidence = Math.min(confidence, 0.25);

    return {
      module: this.key,
      title,
      occurredAt: text.occurredAt,
      isAllDay: text.isAllDay,
      priority,
      payload: taskPayloadSchema.parse({ estimateMinutes: text.durationMinutes }),
      rrule: text.rrule,
      // ระบุเวลา = อยากถูกเตือนตอนนั้น · ทั้งวันไม่เตือนเอง (ผู้ใช้เพิ่มได้ในหน้ารายละเอียด)
      reminders: text.time ? [{ channel: 'push', offsetMinutes: 0 }] : [],
      confidence: Math.min(confidence, 0.95),
      matchedTokens: matched,
    };
  }
}
