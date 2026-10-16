import type { EntryDto, ModuleKey, ParsedEntryDto } from '@nosion/contracts';
import { formatMoney } from '@nosion/core/money';
import type { NlToken } from '@nosion/core/nl';
import { CATEGORY } from '@/features/expenses/categories';
import { PRIMARY_NAV, SETTINGS_NAV } from '@/components/shell/nav';

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

export const COMMANDS: readonly PaletteCommand[] = [
  ...[...PRIMARY_NAV, SETTINGS_NAV]
    .filter((n) => n.ready)
    .map((n) => ({
      id: `go:${n.href}`,
      label: `ไปหน้า${n.label}`,
      keywords: `${n.en} go ${n.href}`,
      action: { kind: 'navigate', href: n.href } as const,
    })),
  {
    id: 'standup',
    label: 'สร้าง Standup',
    keywords: 'standup daily report',
    action: { kind: 'navigate', href: '/today?standup=1' },
  },
  {
    id: 'theme:light',
    label: 'ธีมสว่าง',
    keywords: 'theme light สลับธีม',
    action: { kind: 'theme', theme: 'light' },
  },
  {
    id: 'theme:dark',
    label: 'ธีมมืด',
    keywords: 'theme dark สลับธีม',
    action: { kind: 'theme', theme: 'dark' },
  },
  {
    id: 'theme:system',
    label: 'ธีมตามระบบ',
    keywords: 'theme system auto สลับธีม',
    action: { kind: 'theme', theme: 'system' },
  },
  { id: 'logout', label: 'ออกจากระบบ', keywords: 'logout sign out', action: { kind: 'logout' } },
];

/** กรองคำสั่งด้วยคำหลัง ">" — ทุกคำต้องเจอ (ไม่สนตัวพิมพ์) ใน label หรือ keywords */
export function filterCommands(input: string): PaletteCommand[] {
  const words = input.replace(/^\s*>/, '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...COMMANDS];
  return COMMANDS.filter((c) => {
    const hay = `${c.label} ${c.keywords}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

// ── โหมดสร้าง ──────────────────────────────────────

const MODULE_NOUN: Record<ModuleKey, string> = {
  task: 'งาน',
  expense: 'รายจ่าย',
  workout: 'การออกกำลังกาย',
  habit: 'นิสัย',
};

const TH_DAYS: Record<string, string> = {
  SU: 'อาทิตย์',
  MO: 'จันทร์',
  TU: 'อังคาร',
  WE: 'พุธ',
  TH: 'พฤหัส',
  FR: 'ศุกร์',
  SA: 'เสาร์',
};

/** RRULE ที่ parser สร้าง → ภาษาคน: "ทุกเดือน วันที่ 5" · "ทุกจันทร์, พุธ" · "ทุก 2 สัปดาห์" */
export function describeRrule(rrule: string): string {
  const parts = Object.fromEntries(rrule.split(';').map((p) => p.split('=') as [string, string]));
  const n = Number(parts.INTERVAL ?? 1);
  const unit =
    { DAILY: 'วัน', WEEKLY: 'สัปดาห์', MONTHLY: 'เดือน', YEARLY: 'ปี' }[parts.FREQ ?? ''] ?? '';
  if (parts.BYDAY) {
    const days = parts.BYDAY.split(',');
    if (days.join() === 'MO,TU,WE,TH,FR') return 'ทุกวันธรรมดา';
    if (days.join() === 'SA,SU') return 'ทุกเสาร์-อาทิตย์';
    return `ทุก${days.map((d) => TH_DAYS[d] ?? d).join(', ')}`;
  }
  const base = n > 1 ? `ทุก ${n} ${unit}` : `ทุก${unit}`;
  return parts.BYMONTHDAY ? `${base} วันที่ ${parts.BYMONTHDAY}` : base;
}

/** "กาแฟ" → "สร้างรายจ่าย" / มีการเกิดซ้ำ → "สร้างรายจ่ายประจำ" (สเปก 8.3) */
export function createLabel(p: ParsedEntryDto): string {
  if (p.rrule && p.payload.isBill === true) return 'สร้างบิลประจำ';
  return `สร้าง${MODULE_NOUN[p.module]}${p.rrule ? 'ประจำ' : ''}`;
}

/** วันเวลาแบบสั้นตามโซนผู้ใช้: "วันนี้" · "พรุ่งนี้ 17:00" · "5 พ.ย." */
export function whenLabel(
  iso: string | null,
  isAllDay: boolean,
  timeZone: string,
  now = new Date(),
): string | null {
  if (!iso) return null;
  const ymd = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone }).format(d);
  const day = ymd(new Date(iso));
  const diff = Math.round((Date.parse(day) - Date.parse(ymd(now))) / 86_400_000);
  const dayText =
    diff === 0
      ? 'วันนี้'
      : diff === 1
        ? 'พรุ่งนี้'
        : diff === -1
          ? 'เมื่อวาน'
          : new Intl.DateTimeFormat('th-TH', { timeZone, day: 'numeric', month: 'short' }).format(
              new Date(iso),
            );
  if (isAllDay) return dayText;
  const time = new Intl.DateTimeFormat('en-GB', {
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
      `${direction === 'income' ? '+' : ''}${formatMoney(amountMinor, currency ?? 'THB', { decimals: false })}`,
    );
  }
  if (category && category !== 'other' && CATEGORY[category]) bits.push(CATEGORY[category].label);
  if (p.priority !== 'none') bits.push(`!${p.priority}`);
  const when = p.rrule ? null : whenLabel(p.occurredAt, p.isAllDay, timeZone, now);
  if (when) bits.push(when);
  if (p.rrule) bits.push(`↻ ${describeRrule(p.rrule)}`);
  if (p.reminders.length) bits.push(`🔔 เตือน ${p.reminders.length}`);
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
    const date = new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date(entry.occurredAt));
    return `/calendar?date=${date}`;
  }
  if (entry.module === 'expense') return '/expenses';
  return `/tasks?q=${encodeURIComponent(entry.title)}`;
}
