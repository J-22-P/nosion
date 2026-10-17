import type { EntryDto, ModuleKey, ParsedEntryDto } from '@nosion/contracts';
import { formatMoney } from '@nosion/core/money';
import type { NlToken } from '@nosion/core/nl';
import { CATEGORY } from '@/features/expenses/categories';
import { PRIMARY_NAV, SETTINGS_NAV } from '@/components/shell/nav';
import { currentIntlLocale, dateFormat, tr } from '@/i18n/current';
import { dateTimeFormat } from '@nosion/core/intl';

/**
 * ส่วนคำนวณของ Command Palette (สเปก 8.3) — pure ทั้งไฟล์ ทดสอบได้โดยไม่ต้อง render
 *
 * 3 โหมดในกล่องเดียว:
 *   ""          → idle: คำแนะนำ + ไปหน้าต่าง ๆ
 *   ">…"        → command: ไปหน้า…, สลับธีม, ออกจากระบบ
 *   อย่างอื่น    → create (POST /parse) + search (GET /entries?q=) พร้อมกัน — ↵ = ตัวเลือกบนสุด
 */
export type PaletteMode = 'idle' | 'command' | 'create';

export function paletteMode(input: string): PaletteMode {
  const text = input.trim();
  if (!text) return 'idle';
  return text.startsWith('>') ? 'command' : 'create';
}

// ── โหมดคำสั่ง ─────────────────────────────────────

export type CommandAction =
  | { kind: 'navigate'; href: string }
  | { kind: 'theme'; theme: 'light' | 'dark' | 'system' }
  | { kind: 'logout' };

export interface PaletteCommand {
  id: string;
  label: string;
  /** คำค้นเพิ่ม (อังกฤษ / คำพ้อง) */
  keywords: string;
  action: CommandAction;
}

/** รายการคำสั่ง — สร้างตอนเรียก (ชื่อตามภาษาปัจจุบัน) */
export const commands = (): PaletteCommand[] => [
  ...[...PRIMARY_NAV, SETTINGS_NAV]
    .filter((n) => n.ready)
    .map((n) => ({
      id: `go:${n.href}`,
      label: tr('palette.goTo', { page: tr(`nav.${n.key}`) }),
      keywords: `${n.en} go ${n.href}`,
      action: { kind: 'navigate', href: n.href } as const,
    })),
  {
    id: 'standup',
    label: tr('palette.standup'),
    keywords: 'standup daily report',
    action: { kind: 'navigate', href: '/today?standup=1' },
  },
  {
    id: 'theme:light',
    label: tr('palette.themeLight'),
    keywords: 'theme light สลับธีม',
    action: { kind: 'theme', theme: 'light' },
  },
  {
    id: 'theme:dark',
    label: tr('palette.themeDark'),
    keywords: 'theme dark สลับธีม',
    action: { kind: 'theme', theme: 'dark' },
  },
  {
    id: 'theme:system',
    label: tr('palette.themeSystem'),
    keywords: 'theme system auto สลับธีม',
    action: { kind: 'theme', theme: 'system' },
  },
  {
    id: 'logout',
    label: tr('palette.logout'),
    keywords: 'logout sign out ออกจากระบบ',
    action: { kind: 'logout' },
  },
];

/** กรองคำสั่งด้วยคำหลัง ">" — ทุกคำต้องเจอ (ไม่สนตัวพิมพ์) ใน label หรือ keywords */
export function filterCommands(input: string): PaletteCommand[] {
  const words = input.replace(/^\s*>/, '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  const all = commands();
  if (words.length === 0) return all;
  return all.filter((c) => {
    const hay = `${c.label} ${c.keywords}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

// ── โหมดสร้าง ──────────────────────────────────────

const RRULE_DAYS = new Set(['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']);
const FREQ_KEY: Record<string, string> = {
  DAILY: 'daily',
  WEEKLY: 'weekly',
  MONTHLY: 'monthly',
  YEARLY: 'yearly',
};

/** RRULE ที่ parser สร้าง → ภาษาคน: "ทุกเดือน วันที่ 5" · "ทุกจันทร์, พุธ" · "ทุก 2 สัปดาห์" */
export function describeRrule(rrule: string): string {
  const parts = Object.fromEntries(rrule.split(';').map((p) => p.split('=') as [string, string]));
  const n = Number(parts.INTERVAL ?? 1);
  if (parts.BYDAY) {
    const days = parts.BYDAY.split(',');
    if (days.join() === 'MO,TU,WE,TH,FR') return tr('rrule.weekdays');
    if (days.join() === 'SA,SU') return tr('rrule.weekends');
    const names = days.map((d) => (RRULE_DAYS.has(d) ? tr(`rrule.day.${d}`) : d));
    return tr('rrule.onDays', { days: names.join(tr('rrule.daySeparator')) });
  }
  const freq = FREQ_KEY[parts.FREQ ?? ''];
  const base = freq ? tr(`rrule.${freq}`, { n }) : '';
  return parts.BYMONTHDAY ? tr('rrule.onMonthDay', { base, day: parts.BYMONTHDAY }) : base;
}

/** "กาแฟ" → "สร้างรายจ่าย" / มีการเกิดซ้ำ → "สร้างรายจ่ายประจำ" (สเปก 8.3) */
export function createLabel(p: ParsedEntryDto): string {
  if (p.rrule && p.payload.isBill === true) return tr('palette.createBill');
  return tr(`palette.${p.rrule ? 'createRecurring' : 'create'}.${p.module satisfies ModuleKey}`);
}

/** วันเวลาแบบสั้นตามโซนผู้ใช้: "วันนี้" · "พรุ่งนี้ 17:00" · "5 พ.ย." */
export function whenLabel(
  iso: string | null,
  isAllDay: boolean,
  timeZone: string,
  now = new Date(),
): string | null {
  if (!iso) return null;
  const ymd = (d: Date) => dateTimeFormat('en-CA', { timeZone }).format(d);
  const day = ymd(new Date(iso));
  const diff = Math.round((Date.parse(day) - Date.parse(ymd(now))) / 86_400_000);
  const dayText =
    diff === 0
      ? tr('format.today')
      : diff === 1
        ? tr('format.tomorrow')
        : diff === -1
          ? tr('format.yesterday')
          : dateFormat({ timeZone, day: 'numeric', month: 'short' }).format(new Date(iso));
  if (isAllDay) return dayText;
  const time = dateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso));
  return `${dayText} ${time}`;
}

/** บรรทัดรายละเอียดใต้ "สร้างรายจ่าย": "กาแฟ · ฿65 · อาหาร · วันนี้" (+ รอบ + เตือน) */
export function describeParsed(p: ParsedEntryDto, timeZone: string, now = new Date()): string {
  const bits: string[] = [p.title];
  const { amountMinor, currency, category, direction } = p.payload as {
    amountMinor?: number;
    currency?: string;
    category?: keyof typeof CATEGORY;
    direction?: string;
  };
  if (typeof amountMinor === 'number') {
    bits.push(
      `${direction === 'income' ? '+' : ''}${formatMoney(amountMinor, currency ?? 'THB', { decimals: false, locale: currentIntlLocale() })}`,
    );
  }
  if (category && category !== 'other' && CATEGORY[category]) bits.push(CATEGORY[category].label);
  if (p.priority !== 'none') bits.push(`!${p.priority}`);
  const when = p.rrule ? null : whenLabel(p.occurredAt, p.isAllDay, timeZone, now);
  if (when) bits.push(when);
  if (p.rrule) bits.push(`↻ ${describeRrule(p.rrule)}`);
  if (p.reminders.length) bits.push(tr('palette.reminders', { count: p.reminders.length }));
  return bits.join(' · ');
}

/** ส่วนของข้อความที่ parser เข้าใจ — highlight ใต้ช่องพิมพ์ทันทีจาก parser ฝั่ง client (ไม่รอ server) */
export function highlightSegments(
  input: string,
  tokens: readonly Pick<NlToken, 'start' | 'end' | 'kind'>[],
) {
  const segments: { text: string; kind: NlToken['kind'] | null }[] = [];
  let cursor = 0;
  for (const t of [...tokens].sort((a, b) => a.start - b.start)) {
    if (t.start < cursor) continue;
    if (t.start > cursor) segments.push({ text: input.slice(cursor, t.start), kind: null });
    segments.push({ text: input.slice(t.start, t.end), kind: t.kind });
    cursor = t.end;
  }
  if (cursor < input.length) segments.push({ text: input.slice(cursor), kind: null });
  return segments;
}

// ── ผลค้นหา ────────────────────────────────────────

/** ไปที่ไหนเมื่อเลือกผลค้นหา / ⇧↵ — มีวันที่ = เปิดวันนั้นในปฏิทิน (day panel แสดงรายการ) · ไม่มี = หน้าโมดูล */
export function entryHref(
  entry: Pick<EntryDto, 'module' | 'occurredAt' | 'title'>,
  timeZone: string,
): string {
  if (entry.occurredAt) {
    const date = dateTimeFormat('en-CA', { timeZone }).format(new Date(entry.occurredAt));
    return `/calendar?date=${date}`;
  }
  if (entry.module === 'expense') return '/expenses';
  return `/tasks?q=${encodeURIComponent(entry.title)}`;
}
