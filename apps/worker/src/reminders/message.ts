import { formatInTimeZone, formatMoney } from '@nosion/core';
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

const TH_MONTHS = [
  'ม.ค.',
  'ก.พ.',
  'มี.ค.',
  'เม.ย.',
  'พ.ค.',
  'มิ.ย.',
  'ก.ค.',
  'ส.ค.',
  'ก.ย.',
  'ต.ค.',
  'พ.ย.',
  'ธ.ค.',
];

/** หน้าที่ notification พาไป — ยังไม่มีหน้ารายละเอียดราย entry จึงพาไปหน้าของโมดูล */
const DEEP_LINK: Record<string, string> = { task: '/tasks', expense: '/expenses' };

function dayNumber(ymd: string): number {
  return Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10)) / 86_400_000;
}

/** "ครบกำหนดพรุ่งนี้" / "ถึงเวลา 14:30" — คิดวันตามปฏิทินของผู้ใช้ ไม่ใช่ UTC */
export function dueText(occurredAt: Date, isAllDay: boolean, now: Date, timeZone: string): string {
  const due = formatInTimeZone(occurredAt, timeZone);
  const days = dayNumber(due) - dayNumber(formatInTimeZone(now, timeZone));
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(occurredAt);
  if (days < 0) return `เลยกำหนดมา ${-days} วัน`;
  if (days === 0) return isAllDay ? 'ครบกำหนดวันนี้' : `ถึงเวลา ${time}`;
  if (days === 1) return isAllDay ? 'ครบกำหนดพรุ่งนี้' : `พรุ่งนี้ ${time}`;
  const date = `${+due.slice(8, 10)} ${TH_MONTHS[+due.slice(5, 7) - 1]}`;
  return isAllDay ? `ครบกำหนด ${date}` : `${date} ${time}`;
}

/** ข้อความแจ้งเตือน (สเปก 10.3) — บิลแสดงยอดเงินในหัว และปุ่มเป็น "จ่ายแล้ว" */
export function buildReminderMessage(
  entry: MessageEntry,
  settings: { timezone: string; currency: string },
  now: Date,
): ReminderMessage {
  const payload = (entry.payload ?? {}) as {
    amountMinor?: number;
    currency?: string;
    isBill?: boolean;
  };
  const isMoney = entry.module === 'expense' && typeof payload.amountMinor === 'number';
  const title = isMoney
    ? `${entry.title} ${formatMoney(payload.amountMinor!, payload.currency ?? settings.currency)}`
    : entry.title;
  return {
    userId: entry.userId,
    entryId: entry.id,
    title,
    body: dueText(entry.occurredAt, entry.isAllDay, now, settings.timezone),
    tag: `entry-${entry.id}`,
    deepLink: DEEP_LINK[entry.module] ?? '/today',
    actions: [
      { action: 'complete', title: entry.module === 'expense' ? 'จ่ายแล้ว' : 'เสร็จแล้ว' },
      { action: 'defer', title: 'เลื่อน 1 วัน' },
    ],
  };
}
