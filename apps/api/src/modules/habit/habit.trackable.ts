import { habitPayloadSchema, isHabitComplete, type HabitPayload } from '@nosion/contracts';
import {
  formatInTimeZone,
  resolveDateInput,
  type CalendarAction,
  type CalendarEvent,
  type Entry,
  type ModuleMeta,
  type NlResult,
  type ParsedEntry,
  type TodayWidget,
  type TrackableModule,
  type UserContext,
  type WeeklySection,
  text,
} from '@nosion/core';
import { RegisterModule } from '../../core/registry/register-module.decorator';
import { interpretHabit } from './habit-text';

/** รอบนี้ทำครบหรือยัง — ติ๊กผ่าน /entries/:id/complete (ปุ่มในปฏิทิน) ก็นับว่าครบแม้ currentValue ยังไม่ถึงเป้า */
export function isDone(entry: Pick<Entry, 'status' | 'payload'>): boolean {
  return entry.status === 'done' || isHabitComplete(entry.payload as HabitPayload);
}

function progressText(p: HabitPayload): string {
  return p.kind === 'count' ? `${p.currentValue}/${p.targetValue} ${p.unit}` : '';
}

/**
 * โมดูลที่สาม (Phase 6) — **ไม่มีไฟล์ใน core/, entries/, calendar/, parse/ ที่รู้จักคลาสนี้**
 * ลงทะเบียนผ่าน @RegisterModule() แล้ว Today, ปฏิทิน, ⌘K, Weekly Review, parser รู้จักเองทั้งหมด
 * นิสัยหนึ่งตัว = กฎการเกิดซ้ำ · หนึ่งรอบ = entry ที่ถือ currentValue ของวันนั้น
 */
@RegisterModule()
export class HabitTrackableModule implements TrackableModule<HabitPayload> {
  readonly key = 'habit' as const;

  readonly meta: ModuleMeta = {
    label: { th: 'นิสัย', en: 'Habits' },
    icon: 'repeat',
    color: '#71717a',
    description: { th: 'กิจวัตรประจำวัน นับ streak', en: 'Daily routines and streaks' },
  };

  readonly payloadSchema = habitPayloadSchema;
  readonly supportsRecurrence = true;
  readonly supportsReminder = true;

  toCalendarEvent(entry: Entry): CalendarEvent | null {
    if (!entry.occurredAt) return null;
    const p = entry.payload as HabitPayload;
    const done = isDone(entry);
    const progress = progressText(p);
    return {
      id: `habit:${entry.id}`,
      entryId: entry.id,
      module: this.key,
      title: progress ? `${entry.title} ${progress}` : entry.title,
      start: entry.occurredAt,
      end: null,
      allDay: true,
      color: this.meta.color,
      status: done ? 'done' : entry.status,
      meta: {
        badge: done
          ? 'สำเร็จ'
          : p.kind === 'before_time'
            ? `ก่อน ${p.deadlineLocalTime}`
            : undefined,
        // เว็บแปลจาก key นี้ตามภาษาของผู้ใช้ (toCalendarEvent ไม่รู้ภาษา)
        badgeKey: done ? 'done' : p.kind === 'before_time' ? 'before' : undefined,
        deadline: p.deadlineLocalTime,
        progress: { current: p.currentValue, target: p.targetValue, unit: p.unit },
        deepLink: '/habits',
      },
    };
  }

  calendarActions(entry: Entry): CalendarAction[] {
    if (isDone(entry) || entry.status === 'cancelled' || entry.status === 'skipped') return [];
    const p = entry.payload as HabitPayload;
    return p.kind === 'count'
      ? [{ kind: 'open', label: 'บันทึกจำนวน', href: '/habits' }]
      : [{ kind: 'complete', label: 'สำเร็จ', presentation: 'checkbox' }];
  }

  /** การ์ด "นิสัย" (สเปก 8.11.1) — เฉพาะรอบของวันนี้ · รอบที่พลาดเมื่อวานไม่ค้างมาวันนี้ (ต่างจากงาน) */
  summarizeToday(entries: Entry[], ctx: UserContext): TodayWidget {
    const now = ctx.now ?? new Date();
    const lang = ctx.locale;
    const today = formatInTimeZone(now, ctx.timezone);
    const todays = entries.filter(
      (e) => e.occurredAt && formatInTimeZone(e.occurredAt, ctx.timezone) === today,
    );
    const done = todays.filter(isDone).length;

    return {
      module: this.key,
      title: text(lang, 'habit.today.title'),
      order: 30,
      headline: todays.length
        ? text(lang, 'habit.today.headline', { done, total: todays.length })
        : text(lang, 'habit.today.none'),
      progress: { done, total: todays.length },
      items: todays.map((e) => ({
        entryId: e.id,
        title: e.title,
        status: isDone(e) ? 'done' : e.status,
        occurredAt: e.occurredAt,
        detail: progressText(e.payload as HabitPayload) || undefined,
      })),
      // ข้อมูลที่การ์ดของเว็บใช้วาดปุ่ม −1/+1 · "สำเร็จ" · "รอเวลากลางคืน" (core ไม่อ่าน)
      data: {
        habits: todays.map((e) => {
          const p = e.payload as HabitPayload;
          return {
            entryId: e.id,
            version: e.version,
            title: e.title,
            subtitle: p.subtitle,
            kind: p.kind,
            currentValue: p.currentValue,
            targetValue: p.targetValue,
            unit: p.unit,
            deadlineLocalTime: p.deadlineLocalTime,
            done: isDone(e),
            completedAt: e.completedAt?.toISOString() ?? null,
          };
        }),
      },
      isEmpty: todays.length === 0,
      emptyCta: { label: text(lang, 'habit.today.empty'), href: '/habits?new=1' },
    };
  }

  summarizeWeek(entries: Entry[], ctx: UserContext): WeeklySection {
    // นับเฉพาะรอบที่ถึงวันแล้ว — รอบล่วงหน้าของวันที่ยังมาไม่ถึงไม่ใช่ "ยังไม่ทำ" (Review ของสัปดาห์นี้กลางสัปดาห์)
    const today = formatInTimeZone(ctx.now ?? new Date(), ctx.timezone);
    const lang = ctx.locale;
    const counted = entries.filter(
      (e) =>
        e.status !== 'skipped' &&
        e.status !== 'cancelled' &&
        (!e.occurredAt || formatInTimeZone(e.occurredAt, ctx.timezone) <= today),
    );
    const done = counted.filter(isDone);
    const rate = counted.length ? Math.round((done.length / counted.length) * 100) : 0;

    const byTitle = new Map<string, { done: number; total: number }>();
    for (const e of counted) {
      const s = byTitle.get(e.title) ?? { done: 0, total: 0 };
      s.total += 1;
      if (isDone(e)) s.done += 1;
      byTitle.set(e.title, s);
    }
    const ranked = [...byTitle.entries()].sort(
      (a, b) => b[1].done / b[1].total - a[1].done / a[1].total,
    );
    const highlights: string[] = [];
    const best = ranked.at(0);
    const worst = ranked.at(-1);
    if (best && best[1].done > 0)
      highlights.push(
        text(lang, 'habit.week.best', { title: best[0], done: best[1].done, total: best[1].total }),
      );
    if (worst && ranked.length > 1 && worst[1].done < worst[1].total) {
      highlights.push(
        text(lang, 'habit.week.worst', {
          title: worst[0],
          done: worst[1].done,
          total: worst[1].total,
        }),
      );
    }

    return {
      module: this.key,
      title: text(lang, 'habit.week.title'),
      order: 30,
      stats: [
        { label: text(lang, 'habit.week.done'), value: `${done.length}/${counted.length}` },
        { label: text(lang, 'habit.week.rate'), value: `${rate}%` },
        { label: text(lang, 'habit.week.count'), value: String(byTitle.size) },
      ],
      highlights,
    };
  }

  parseNaturalLanguage(text: NlResult, ctx: UserContext): ParsedEntry | null {
    const parsed = interpretHabit(text);
    if (!parsed) return null;
    // นิสัยเป็นรายการทั้งวัน: รอบแรก = เที่ยงคืนของวันนั้นตามโซนผู้ใช้ (เวลาใน "นอนก่อน 23:45" คือ deadline ไม่ใช่เวลาของรอบ)
    const firstDay = text.date ?? formatInTimeZone(ctx.now ?? new Date(), ctx.timezone);
    return {
      module: this.key,
      title: parsed.title,
      occurredAt: resolveDateInput(firstDay, ctx.timezone),
      isAllDay: true,
      payload: habitPayloadSchema.parse({
        kind: parsed.kind,
        targetValue: parsed.targetValue,
        unit: parsed.unit,
        deadlineLocalTime: parsed.deadlineLocalTime,
        cadence: parsed.cadence,
        weeklyTarget: parsed.weeklyTarget,
      }),
      rrule: parsed.rrule,
      confidence: parsed.confidence,
      matchedTokens: parsed.matchedTokens,
    };
  }
}
