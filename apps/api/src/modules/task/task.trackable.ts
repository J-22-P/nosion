import { taskPayloadSchema, type TaskPayload } from '@nosion/contracts';
import {
  isOverdue,
  type CalendarEvent,
  type Entry,
  type ModuleMeta,
  type ParsedEntry,
  type TodayWidget,
  type TrackableModule,
  type UserContext,
  type WeeklySection,
} from '@nosion/core';
import { RegisterModule } from '../../core/registry/register-module.decorator';

/** คำที่บอกว่าเป็นงาน + คำบอกเวลาแบบไทย ใช้ในโหมดสร้างของ ⌘K */
const TASK_HINTS = ['ทำ', 'งาน', 'ส่ง', 'นัด', 'ประชุม', 'โทร', 'เตรียม', 'todo', 'task'];
const PRIORITY_HINTS: { pattern: RegExp; priority: TodayPriority }[] = [
  { pattern: /ด่วนมาก|urgent|!!!/i, priority: 'urgent' },
  { pattern: /ด่วน|สำคัญ|!!/i, priority: 'high' },
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

  summarizeToday(entries: Entry[], ctx: UserContext): TodayWidget {
    const now = ctx.now ?? new Date();
    const done = entries.filter((e) => e.status === 'done').length;
    const overdue = entries.filter((e) => isOverdue(e.occurredAt, now, e.status === 'done'));
    const open = entries.filter((e) => e.status !== 'done' && e.status !== 'cancelled');

    return {
      module: this.key,
      title: 'งานวันนี้',
      order: 10,
      headline: `${done}/${entries.length} งาน`,
      subline: overdue.length > 0 ? `เลยกำหนด ${overdue.length} รายการ` : undefined,
      items: open.slice(0, 8).map((e) => ({
        entryId: e.id,
        title: e.title,
        status: e.status,
        priority: e.priority,
        occurredAt: e.occurredAt,
        detail: isOverdue(e.occurredAt, now, false) ? 'เลยกำหนด' : undefined,
      })),
      isEmpty: entries.length === 0,
      emptyCta: { label: 'เพิ่มงานแรก', href: '/tasks?new=1' },
    };
  }

  summarizeWeek(entries: Entry[], _ctx: UserContext): WeeklySection {
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
    if (done.length > 0) highlights.push(`ปิดงานได้ ${done.length} รายการ`);
    if (mostDeferred && ((mostDeferred.payload as TaskPayload).deferCount ?? 0) > 0) {
      highlights.push(
        `งานที่ผัดบ่อยที่สุด: "${mostDeferred.title}" (${(mostDeferred.payload as TaskPayload).deferCount} ครั้ง)`,
      );
    }

    return {
      module: this.key,
      title: 'งาน',
      order: 10,
      stats: [
        { label: 'ทำเสร็จ', value: `${done.length}/${entries.length}` },
        { label: 'เวลาที่ประเมิน', value: `${Math.round(estimated / 60)} ชม.` },
        { label: 'เวลาที่ใช้จริง', value: `${Math.round(actual / 60)} ชม.` },
      ],
      highlights,
    };
  }

  /**
   * Phase 1: heuristic แบบง่าย — จับคำบอกเวลาไทยและระดับความสำคัญ
   * Phase 5 จะย้ายไปใช้ NL Parser กลางที่ใช้โค้ดชุดเดียวกับ frontend
   */
  parseNaturalLanguage(input: string, ctx: UserContext): ParsedEntry | null {
    const text = input.trim();
    if (!text) return null;

    const now = ctx.now ?? new Date();
    const day = 24 * 60 * 60 * 1000;
    let occurredAt: Date | null = null;
    let confidence = 0.35;
    const matched: string[] = [];

    if (/พรุ่งนี้|tomorrow/i.test(text)) {
      occurredAt = new Date(now.getTime() + day);
      confidence += 0.2;
      matched.push('พรุ่งนี้');
    } else if (/มะรืน/i.test(text)) {
      occurredAt = new Date(now.getTime() + 2 * day);
      confidence += 0.2;
      matched.push('มะรืน');
    } else if (/วันนี้|today/i.test(text)) {
      occurredAt = now;
      confidence += 0.2;
      matched.push('วันนี้');
    }

    let priority: TodayPriority = 'none';
    for (const hint of PRIORITY_HINTS) {
      if (hint.pattern.test(text)) {
        priority = hint.priority;
        confidence += 0.1;
        break;
      }
    }

    if (TASK_HINTS.some((hint) => text.toLowerCase().includes(hint))) {
      confidence += 0.15;
    }

    // ตัวเลขล้วนท้ายข้อความมักเป็นจำนวนเงิน → ปล่อยให้โมดูล expense รับไป
    if (/\d+(\.\d+)?\s*(บาท|฿)?$/.test(text) && !occurredAt) return null;

    return {
      module: this.key,
      title: text,
      occurredAt,
      isAllDay: true,
      priority,
      payload: taskPayloadSchema.parse({}),
      confidence: Math.min(confidence, 0.95),
      matchedTokens: matched,
    };
  }
}
