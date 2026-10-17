import { formatInTimeZone, formatMoney, intlLocaleOf, text, type Lang } from '@nosion/core';
import type { ReminderMessage } from './dispatcher';

export interface MessageEntry {
  id: string;
  userId: string;
  module: string;
  title: string;
  occurredAt: Date;
  isAllDay: boolean;
  payload: unknown;
}

/** หน้าที่ notification พาไป — ยังไม่มีหน้ารายละเอียดราย entry จึงพาไปหน้าของโมดูล */
const DEEP_LINK: Record<string, string> = { task: '/tasks', expense: '/expenses' };

function dayNumber(ymd: string): number {
  return Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10)) / 86_400_000;
}

/** "ครบกำหนดพรุ่งนี้" / "ถึงเวลา 14:30" — คิดวันตามปฏิทินของผู้ใช้ ไม่ใช่ UTC · ภาษาตาม settings.locale */
export function dueText(
  occurredAt: Date,
  isAllDay: boolean,
  now: Date,
  timeZone: string,
  lang: Lang = 'th',
): string {
  const due = formatInTimeZone(occurredAt, timeZone);
  const days = dayNumber(due) - dayNumber(formatInTimeZone(now, timeZone));
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(occurredAt);
  if (days < 0) return text(lang, 'notify.overdue', { days: -days });
  if (days === 0)
    return isAllDay ? text(lang, 'notify.dueToday') : text(lang, 'notify.atTime', { time });
  if (days === 1) {
    return isAllDay ? text(lang, 'notify.dueTomorrow') : text(lang, 'notify.tomorrowAt', { time });
  }
  // "23 ต.ค." · "Oct 23" — วันที่ตามปฏิทินของผู้ใช้ (ตีความเป็นเที่ยงวัน UTC ไม่ให้เลื่อนวัน)
  const date = new Intl.DateTimeFormat(lang === 'en' ? 'en-US' : 'th-TH', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${due}T12:00:00Z`));
  return isAllDay
    ? text(lang, 'notify.dueOn', { date })
    : text(lang, 'notify.onAt', { date, time });
}

/** ข้อความแจ้งเตือน (สเปก 10.3) — บิลแสดงยอดเงินในหัว และปุ่มเป็น "จ่ายแล้ว" */
export function buildReminderMessage(
  entry: MessageEntry,
  settings: { timezone: string; currency: string; locale?: string },
  now: Date,
): ReminderMessage {
  const lang: Lang = settings.locale === 'en' ? 'en' : 'th';
  const payload = (entry.payload ?? {}) as {
    amountMinor?: number;
    currency?: string;
    isBill?: boolean;
  };
  const isMoney = entry.module === 'expense' && typeof payload.amountMinor === 'number';
  const title = isMoney
    ? `${entry.title} ${formatMoney(payload.amountMinor!, payload.currency ?? settings.currency, { locale: intlLocaleOf(lang) })}`
    : entry.title;
  return {
    userId: entry.userId,
    entryId: entry.id,
    title,
    body: dueText(entry.occurredAt, entry.isAllDay, now, settings.timezone, lang),
    tag: `entry-${entry.id}`,
    deepLink: DEEP_LINK[entry.module] ?? '/today',
    actions: [
      {
        action: 'complete',
        title: text(lang, entry.module === 'expense' ? 'notify.actionPaid' : 'notify.actionDone'),
      },
      { action: 'defer', title: text(lang, 'notify.actionDefer') },
    ],
  };
}
