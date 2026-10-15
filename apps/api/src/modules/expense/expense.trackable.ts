import { expensePayloadSchema, type ExpenseCategory, type ExpensePayload } from '@nosion/contracts';
import {
  formatMoney,
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
} from '@nosion/core';
import { RegisterModule } from '../../core/registry/register-module.decorator';
import { ExpenseStatsService } from './expense-stats.service';
import { CATEGORY_LABEL_TH } from './expense-labels';
import { interpretExpense } from './expense-text';
import { buildExpenseTodayWidget } from './expense-today';
import { isSpent, sumSpent } from './spend-rules';

/** ล่วงหน้า 1 วัน เวลา 09:00 — offset เทียบเที่ยงคืนของวันครบกำหนด */
const BILL_REMINDER_OFFSET = -1440 + 9 * 60;

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

  /** ข้อมูลทั้งเดือน (งบ, บิล) ของการ์ด Today — โมดูลดึงเอง core ไม่ต้องรู้ */
  constructor(private readonly stats: ExpenseStatsService) {}

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
      meta: {
        badge: paid ? 'จ่ายแล้ว' : 'ครบกำหนด',
        deepLink: `/expenses?entry=${entry.id}`,
        // Quick Snapshot ของปฏิทินรวมยอดบิลที่ครบกำหนดในสัปดาห์
        amountMinor: p.amountMinor,
        currency: p.currency,
      },
    };
  }

  /** บิลที่ยังไม่จ่าย = ปุ่ม "จ่ายแล้ว" (Mark Paid ใน mockup 8.11.4) */
  calendarActions(entry: Entry): CalendarAction[] {
    const p = entry.payload as ExpensePayload;
    if (!p.isBill || entry.status === 'done' || entry.status === 'cancelled') return [];
    return [{ kind: 'complete', label: 'จ่ายแล้ว', presentation: 'button' }];
  }

  /** การ์ด "การเงินและงบประมาณ": ใช้วันนี้ + เดือนนี้เทียบงบ + แจ้งเตือนหมวด/บิล */
  async summarizeToday(entries: Entry[], ctx: UserContext): Promise<TodayWidget> {
    const now = ctx.now ?? new Date();
    const [status, bills] = await Promise.all([
      this.stats.budgetStatus(ctx.userId, undefined, now),
      this.stats.billsUpcoming(ctx.userId, 2, now),
    ]);
    return buildExpenseTodayWidget({ entries, status, bills, timeZone: ctx.timezone, now });
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

  parseNaturalLanguage(text: NlResult, ctx: UserContext): ParsedEntry | null {
    const now = ctx.now ?? new Date();
    const parsed = interpretExpense(text, ctx.currency);
    if (!parsed) return null;

    return {
      module: this.key,
      title: parsed.title,
      // บิล = วันครบกำหนด (ทั้งวัน) · ระบุวันเอง ("เมื่อวาน") = วันนั้น · ไม่ระบุ = ตอนนี้
      occurredAt: parsed.dueAt ?? parsed.occurredAt ?? now,
      isAllDay: parsed.isBill || (parsed.occurredAt !== null && text.isAllDay),
      payload: expensePayloadSchema.parse({
        amountMinor: parsed.amountMinor,
        currency: ctx.currency,
        direction: parsed.direction,
        category: parsed.category,
        costType: parsed.isBill ? 'fixed' : 'variable',
        isBill: parsed.isBill,
      }),
      rrule: parsed.rrule,
      // ค่าเริ่มต้นเดียวกับ "เพิ่มรอบบิลใหม่" — ล่วงหน้า 1 วัน 09:00 (DoD Phase 5: บิลพร้อมการเตือนในคำสั่งเดียว)
      reminders: parsed.isBill ? [{ channel: 'push', offsetMinutes: BILL_REMINDER_OFFSET }] : [],
      confidence: parsed.confidence,
      matchedTokens: parsed.matchedTokens,
    };
  }
}
