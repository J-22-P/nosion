import type { NlPriority, NlResult, NlToken } from '@nosion/core/nl';
import { describeRrule } from '@/features/command-palette/palette-model';
import { dateFormat, tr } from '@/i18n/current';
import { priorityLabel } from '@/lib/format';

/**
 * chip ของบันทึกด่วน (สเปก 8.11.2 · 8.11.3 · Phase 5 ขั้น 8) — pure ทั้งไฟล์
 *
 * ข้อความในช่องพิมพ์คือแหล่งความจริงเดียว: chip แสดงสิ่งที่ parser (`@nosion/core/nl` ตัวเดียวกับ server) เข้าใจ
 * แก้ chip = เขียนข้อความส่วนนั้นใหม่ด้วยรูปที่ parser อ่านได้แน่นอน (วันที่ → "17/10/2026", เวลา → "14:30")
 * แล้ว server parse ข้อความเดียวกันตอนบันทึก → สิ่งที่เห็นใน chip = สิ่งที่ถูกบันทึก
 */
export type ChipEditor = 'date' | 'time' | 'priority' | 'text';

export interface CaptureChip {
  key: string;
  kind: NlToken['kind'];
  label: string;
  raw: string;
  start: number;
  end: number;
  /** null = แก้ไม่ได้ (ลบได้อย่างเดียว — แก้ในข้อความตรง ๆ) */
  editor: ChipEditor | null;
  /** ค่าเริ่มต้นของตัวแก้ ('YYYY-MM-DD' · 'HH:mm' · priority · ชื่อแท็ก/โปรเจกต์) */
  value: string;
  tone: 'default' | 'danger';
}

export const PRIORITIES: NlPriority[] = ['urgent', 'high', 'medium', 'low'];

const SHORT_DATE = (ymd: string) =>
  dateFormat({ timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' }).format(
    new Date(`${ymd}T00:00:00Z`),
  );

/** "วันนี้" · "พรุ่งนี้" · "ศ. 23 ต.ค." — `today` เป็นวันของผู้ใช้ ('YYYY-MM-DD') */
export function dayLabel(ymd: string, today: string): string {
  const diff = Math.round((Date.parse(ymd) - Date.parse(today)) / 86_400_000);
  if (diff === 0) return tr('format.today');
  if (diff === 1) return tr('format.tomorrow');
  if (diff === -1) return tr('format.yesterday');
  return SHORT_DATE(ymd);
}

/** chip ของ token ชนิดที่ช่องนี้สนใจ เรียงตามตำแหน่งในข้อความ */
export function buildChips(
  nl: NlResult,
  kinds: readonly NlToken['kind'][],
  today: string,
): CaptureChip[] {
  return nl.tokens
    .filter((t) => kinds.includes(t.kind))
    .map((t): CaptureChip => {
      const base = {
        key: `${t.kind}:${t.start}`,
        kind: t.kind,
        raw: t.raw,
        start: t.start,
        end: t.end,
      };
      switch (t.kind) {
        case 'date':
          return {
            ...base,
            label: dayLabel(t.value, today),
            editor: 'date',
            value: t.value,
            tone: 'default',
          };
        case 'time':
          return { ...base, label: t.value, editor: 'time', value: t.value, tone: 'default' };
        case 'priority':
          return {
            ...base,
            label: `!${priorityLabel(t.value)}`,
            editor: 'priority',
            value: t.value,
            tone: t.value === 'urgent' ? 'danger' : 'default',
          };
        case 'tag':
          return { ...base, label: `#${t.value}`, editor: 'text', value: t.value, tone: 'default' };
        case 'project':
          return { ...base, label: `+${t.value}`, editor: 'text', value: t.value, tone: 'default' };
        case 'recurrence':
          return {
            ...base,
            label: `↻ ${describeRrule(t.rrule)}`,
            editor: null,
            value: t.rrule,
            tone: 'default',
          };
        case 'amount':
          return {
            ...base,
            label: `${t.income ? '+' : ''}฿${t.value}`,
            editor: null,
            value: t.value,
            tone: 'default',
          };
        case 'duration':
          return {
            ...base,
            label: tr('capture.minutes', { n: t.minutes }),
            editor: null,
            value: String(t.minutes),
            tone: 'default',
          };
        case 'quantity':
          return {
            ...base,
            label: `${t.value} ${t.unit}`,
            editor: null,
            value: String(t.value),
            tone: 'default',
          };
      }
    });
}

/** แทนช่วง `[start, end)` ของข้อความ (ว่าง = ลบ) แล้วเก็บช่องว่างให้เรียบร้อย */
export function replaceSpan(
  input: string,
  start: number,
  end: number,
  replacement: string,
): string {
  const before = input.slice(0, start);
  const after = input.slice(end);
  const joined = replacement
    ? `${before}${before && !/\s$/.test(before) ? ' ' : ''}${replacement}${after && !/^\s/.test(after) ? ' ' : ''}${after}`
    : `${before}${after}`;
  return joined.replace(/\s{2,}/g, ' ').replace(/^\s+/, '');
}

/** ค่าที่แก้ใน chip → ข้อความที่ parser อ่านกลับได้ชนิดเดิมแน่นอน · ค่าว่าง = ลบ chip */
export function rawFor(kind: NlToken['kind'], value: string): string {
  const v = value.trim();
  if (!v) return '';
  switch (kind) {
    case 'date': {
      const [y, m, d] = v.split('-').map(Number);
      return `${d}/${m}/${y}`;
    }
    case 'priority':
      return `!${v}`;
    case 'tag':
      return `#${v.replace(/\s+/g, '-')}`;
    case 'project':
      return `+${v.replace(/\s+/g, '-')}`;
    default:
      return v;
  }
}

/** ตัวเลือกวันที่ข้างช่องพิมพ์: แทน token วันที่เดิม หรือต่อท้ายถ้ายังไม่มี · '' = ลบ */
export function withDate(input: string, nl: NlResult, ymd: string): string {
  const current = nl.tokens.find((t) => t.kind === 'date');
  const raw = rawFor('date', ymd);
  if (current) return replaceSpan(input, current.start, current.end, raw);
  if (!raw) return input;
  return `${input.trimEnd()} ${raw}`.trimStart();
}

/** เทียบชื่อแบบไม่สนตัวพิมพ์และถือว่า "-" = ช่องว่าง: "+auth-v2" ตรงกับโปรเจกต์ "Auth v2" (กติกาเดียวกับ API) */
export function sameName(a: string, b: string): boolean {
  const norm = (s: string) =>
    s
      .trim()
      .toLowerCase()
      .replace(/[\s_-]+/g, ' ');
  return norm(a) === norm(b);
}
