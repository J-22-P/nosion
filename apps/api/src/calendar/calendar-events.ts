import type {
  CalendarEventDto,
  CalendarReminderDto,
  ModuleKey,
  ReminderChannel,
  ReminderStatus,
} from '@nosion/contracts';
import { formatInTimeZone, type Entry, type TrackableModule } from '@nosion/core';

export interface CalendarSource {
  entry: Entry;
  /** รอบในอนาคตที่ยังไม่ถูกสร้างเป็น entry */
  projected: boolean;
  reminders: { fireAt: Date; channel: ReminderChannel; status: ReminderStatus }[];
}

export interface BuiltCalendar {
  events: CalendarEventDto[];
  countsByModule: Partial<Record<ModuleKey, number>>;
  reminders: CalendarReminderDto[];
}

/**
 * Calendar Aggregator ส่วนคำนวณล้วน (สเปก 6.3) — ไม่มีชื่อโมดูลอยู่ในไฟล์นี้
 * แต่ละโมดูลตัดสินเองว่า entry ไหนขึ้นปฏิทิน (`toCalendarEvent`) และมีปุ่มอะไร (`calendarActions`)
 * `filter` กรองเฉพาะ events — countsByModule นับทุกโมดูลที่เปิด เพื่อให้ chip แสดงตัวเลขแม้ไม่ได้เลือก
 */
export function buildCalendar(
  sources: CalendarSource[],
  modules: TrackableModule<unknown>[],
  timeZone: string,
  filter?: ModuleKey[],
  /** ช่วงที่ขอ (YYYY-MM-DD รวมทั้งสองวัน) — ตัดรายการที่ไม่ทับช่วงทิ้ง (query ดึงแถบหลายวันเผื่อไว้) */
  range?: { from: string; to: string },
): BuiltCalendar {
  const byKey = new Map(modules.map((m) => [m.key, m]));
  const countsByModule: Partial<Record<ModuleKey, number>> = Object.fromEntries(
    modules.map((m) => [m.key, 0]),
  );
  const events: CalendarEventDto[] = [];
  const reminders: CalendarReminderDto[] = [];

  for (const { entry, projected, reminders: own } of sources) {
    const module = byKey.get(entry.module);
    const event = module?.toCalendarEvent(entry);
    if (!module || !event) continue;
    // วันของ start = วันสุดท้าย · firstDay ที่ไม่ได้อยู่ก่อนวันนั้น (เช่น ปิดงานก่อนวันเริ่ม) = รายการวันเดียว
    const lastDay = formatInTimeZone(event.start, timeZone);
    const multiDay = Boolean(event.firstDay && event.firstDay < lastDay);
    const firstDay = multiDay ? event.firstDay! : lastDay;
    if (range && (firstDay > range.to || lastDay < range.from)) continue;
    countsByModule[module.key] = (countsByModule[module.key] ?? 0) + 1;
    if (filter && !filter.includes(module.key)) continue;

    const live = own.filter((r) => r.status !== 'cancelled');
    events.push({
      id: event.id,
      entryId: projected ? null : entry.id,
      ruleId: entry.recurrenceRuleId,
      version: projected ? null : entry.version,
      module: module.key,
      title: event.title,
      start: event.start.toISOString(),
      end: event.end?.toISOString() ?? null,
      allDay: event.allDay,
      date: firstDay,
      endDate: multiDay ? lastDay : null,
      status: event.status,
      color: event.color,
      projected,
      hasReminder: live.length > 0,
      // รอบที่ยังไม่มี entry กดอะไรไม่ได้ — ต้องรอให้ถูกสร้างก่อน
      actions: projected ? [] : (module.calendarActions?.(entry) ?? []),
      meta: event.meta ?? {},
    });
    for (const r of live) {
      reminders.push({
        entryId: entry.id,
        date: formatInTimeZone(r.fireAt, timeZone),
        fireAt: r.fireAt.toISOString(),
        channel: r.channel,
        status: r.status,
      });
    }
  }

  events.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      Number(b.allDay) - Number(a.allDay) ||
      a.start.localeCompare(b.start),
  );
  reminders.sort((a, b) => a.fireAt.localeCompare(b.fireAt));
  return { events, countsByModule, reminders };
}
