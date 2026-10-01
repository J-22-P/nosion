import { expensePayloadSchema, type ExpenseCategory, type ExpensePayload } from '@nosion/contracts';
import {
  formatMoney,
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
import { parseExpenseText } from './expense-text';

/** ชื่อหมวดภาษาไทยสำหรับข้อความสรุป (UI มีชุดของตัวเองพร้อมไอคอน) */
export const CATEGORY_LABEL_TH: Record<ExpenseCategory, string> = {
  food: 'อาหาร',
  transport: 'เดินทาง',
  housing: 'ที่พัก',
  utilities: 'สาธารณูปโภค',
  health: 'สุขภาพ',
  entertainment: 'บันเทิง',
  shopping: 'ช้อปปิ้ง',
  education: 'การศึกษา',
  subscription: 'สมาชิกรายเดือน',
  debt: 'หนี้สิน',
  savings: 'เงินออม',
  other: 'อื่น ๆ',
};

/** รายการที่นับเป็น "ใช้จ่ายจริง" — ยกเลิกแล้วไม่นับ · บิลที่ยังไม่จ่ายไม่นับ */
export function isSpent(entry: Entry): boolean {
  if (entry.status === 'cancelled' || entry.deletedAt) return false;
  const p = entry.payload as ExpensePayload;
  if (p.direction !== 'expense') return false;
  return !p.isBill || entry.status === 'done';
}

/** ผลรวมรายจ่าย (หน่วยย่อย) ของรายการที่ใช้จ่ายจริง */
export function sumSpent(entries: Entry[]): number {
  return entries
    .filter(isSpent)
    .reduce((sum, e) => sum + (e.payload as ExpensePayload).amountMinor, 0);
}

/**
 * โมดูลที่สอง — พิสูจน์ว่าเพิ่มโมดูลได้โดยไม่แก้ core:
 * ลงทะเบียนผ่าน @RegisterModule() แล้ว /entries, Today, Calendar, ⌘K รู้จักเองทั้งหมด
 */
@RegisterModule()
export class ExpenseTrackableModule implements TrackableModule<ExpensePayload> {
  readonly key = 'expense' as const;

  readonly meta: ModuleMeta = {
    label: { th: 'การเงิน', en: 'Finance' },
    icon: 'wallet',
    color: '#71717a',
    description: { th: 'รายรับรายจ่าย งบประมาณ และบิลประจำ', en: 'Spending, budgets and bills' },
  };

  readonly payloadSchema = expensePayloadSchema;
  /** บิลรายเดือนคือ entry ที่เกิดซ้ำ (Phase 3) */
  readonly supportsRecurrence = true;
  /** เตือนก่อนบิลครบกำหนด (Phase 4) */
  readonly supportsReminder = true;

  /** ขึ้นปฏิทินเฉพาะบิล — รายจ่ายจรที่บันทึกย้อนหลังไม่ต้องขึ้น รกเปล่า ๆ (สเปก 6.3) */
  toCalendarEvent(entry: Entry): CalendarEvent | null {
    const p = entry.payload as ExpensePayload;
    if (!p.isBill || !entry.occurredAt) return null;
    const paid = entry.status === 'done';
    return {
      id: `expense:${entry.id}`,
      entryId: entry.id,
      module: this.key,
      title: `${entry.title} · ${formatMoney(p.amountMinor, p.currency)}`,
      start: entry.occurredAt,
      end: null,
      allDay: true,
      color: this.meta.color,
      status: entry.status,
      meta: { badge: paid ? 'จ่ายแล้ว' : 'ครบกำหนด', deepLink: `/expenses?entry=${entry.id}` },
    };
  }

  /** entries = รายการของวันนี้ · ยอดทั้งเดือนเทียบงบมาจาก /budgets/status (หน้า Today ประกอบเอง) */
  summarizeToday(entries: Entry[], ctx: UserContext): TodayWidget {
    const spent = sumSpent(entries);
    const recent = entries
      .filter((e) => e.status !== 'cancelled')
      .sort((a, b) => (b.occurredAt?.getTime() ?? 0) - (a.occurredAt?.getTime() ?? 0));

    return {
      module: this.key,
      title: 'รายจ่ายวันนี้',
      order: 20,
      headline: `วันนี้ใช้ ${formatMoney(spent, ctx.currency, { decimals: false })}`,
      subline: entries.length > 0 ? `${entries.length} รายการ` : undefined,
      items: recent.slice(0, 5).map((e) => {
        const p = e.payload as ExpensePayload;
        const sign = p.direction === 'income' ? '+' : '−';
        return {
          entryId: e.id,
          title: e.title,
          status: e.status,
          occurredAt: e.occurredAt,
          detail: `${sign}${formatMoney(Math.abs(p.amountMinor), p.currency)}`,
        };
      }),
      isEmpty: entries.length === 0,
      emptyCta: { label: 'บันทึกรายจ่ายแรก', href: '/expenses?new=1' },
    };
  }

  summarizeWeek(entries: Entry[], ctx: UserContext): WeeklySection {
    const spent = sumSpent(entries);
    const income = entries
      .filter(
        (e) => e.status !== 'cancelled' && (e.payload as ExpensePayload).direction === 'income',
      )
      .reduce((sum, e) => sum + (e.payload as ExpensePayload).amountMinor, 0);

    const byCategory = new Map<ExpenseCategory, number>();
    for (const e of entries.filter(isSpent)) {
      const p = e.payload as ExpensePayload;
      byCategory.set(p.category, (byCategory.get(p.category) ?? 0) + p.amountMinor);
    }
    const top = [...byCategory].sort((a, b) => b[1] - a[1]).at(0);

    const money = (minor: number) => formatMoney(minor, ctx.currency, { decimals: false });
    const highlights: string[] = [];
    if (top && spent > 0) {
      const pct = Math.round((top[1] / spent) * 100);
      highlights.push(`ใช้กับ${CATEGORY_LABEL_TH[top[0]]}มากที่สุด ${money(top[1])} (${pct}%)`);
    }

    return {
      module: this.key,
      title: 'การเงิน',
      order: 20,
      stats: [
        { label: 'รายจ่าย', value: money(spent) },
        { label: 'รายรับ', value: money(income) },
        { label: 'จำนวนรายการ', value: String(entries.length) },
      ],
      highlights,
    };
  }

  parseNaturalLanguage(input: string, ctx: UserContext): ParsedEntry | null {
    const now = ctx.now ?? new Date();
    const parsed = parseExpenseText(input, now, ctx.timezone, ctx.currency);
    if (!parsed) return null;

    return {
      module: this.key,
      title: parsed.title,
      // บิล = วันครบกำหนด (ทั้งวัน) · รายจ่ายทั่วไป = ตอนนี้
      occurredAt: parsed.isBill ? parsed.dueAt : now,
      isAllDay: parsed.isBill,
      payload: expensePayloadSchema.parse({
        amountMinor: parsed.amountMinor,
        currency: ctx.currency,
        direction: parsed.direction,
        category: parsed.category,
        costType: parsed.isBill ? 'fixed' : 'variable',
        isBill: parsed.isBill,
      }),
      confidence: parsed.confidence,
      matchedTokens: parsed.matchedTokens,
    };
  }
}
