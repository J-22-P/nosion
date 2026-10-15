import { expensePayloadSchema, type ExpensePayload } from '@nosion/contracts';
import { parseNaturalText, type Entry, type UserContext } from '@nosion/core';
import { nlContextOf } from '../../core/parser/parser.service';
import { beforeEach, describe, expect, it } from 'vitest';
import type { BudgetStatusDto } from '@nosion/contracts';
import type { ExpenseStatsService } from './expense-stats.service';
import { ExpenseTrackableModule } from './expense.trackable';
import { isSpent, sumSpent } from './spend-rules';

const ctx: UserContext = {
  userId: 'u1',
  timezone: 'Asia/Bangkok',
  locale: 'th',
  currency: 'THB',
  weekStartsOn: 1,
  enabledModules: ['task', 'expense'],
  now: new Date('2026-09-18T03:00:00Z'),
};

const entry = (
  payload: Partial<ExpensePayload> & { amountMinor: number },
  over: Partial<Entry> = {},
): Entry => ({
  id: 'e1',
  userId: 'u1',
  module: 'expense',
  title: 'กาแฟ',
  description: null,
  status: 'done',
  priority: 'none',
  occurredAt: new Date('2026-09-18T02:00:00Z'),
  isAllDay: false,
  completedAt: null,
  payload: expensePayloadSchema.parse(payload),
  projectId: null,
  parentId: null,
  recurrenceRuleId: null,
  recurrenceSlot: null,
  sortOrder: 0,
  clientId: null,
  version: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
  ...over,
});

const STATUS: BudgetStatusDto = {
  period: '2026-09',
  firstDay: '2026-09-01',
  lastDay: '2026-09-30',
  currency: 'THB',
  total: {
    spentMinor: 842000,
    budgetMinor: 1500000,
    ratio: 0.5613,
    tone: 'safe',
    budgetSource: 'total',
  },
  categories: [],
};

describe('isSpent / sumSpent', () => {
  it('นับรายจ่าย · ไม่นับรายรับ, รายการที่ยกเลิก และบิลที่ยังไม่จ่าย', () => {
    const entries = [
      entry({ amountMinor: 6500 }),
      entry({ amountMinor: 4500000, direction: 'income' }),
      entry({ amountMinor: 10000 }, { status: 'cancelled' }),
      entry({ amountMinor: 79900, isBill: true }, { status: 'pending' }),
      entry({ amountMinor: 125000, isBill: true }, { status: 'done' }),
    ];
    expect(entries.map(isSpent)).toEqual([true, false, false, false, true]);
    expect(sumSpent(entries)).toBe(6500 + 125000);
  });
});

describe('ExpenseTrackableModule', () => {
  let module: ExpenseTrackableModule;

  beforeEach(() => {
    // stats ใช้เฉพาะ summarizeToday — เทสต์อื่นไม่แตะ
    module = new ExpenseTrackableModule({} as ExpenseStatsService);
  });

  it('ขึ้นปฏิทินเฉพาะบิล', () => {
    expect(module.toCalendarEvent(entry({ amountMinor: 6500 }))).toBeNull();
    const bill = module.toCalendarEvent(
      entry({ amountMinor: 79900, isBill: true }, { title: 'ค่าเน็ต', status: 'pending' }),
    );
    expect(bill).toMatchObject({
      title: 'ค่าเน็ต · ฿799.00',
      allDay: true,
      meta: { badge: 'ครบกำหนด' },
    });
  });

  it('summarizeToday: ดึงงบ + บิลของผู้ใช้จาก stats แล้วประกอบการ์ด (รายละเอียดอยู่ใน expense-today.spec)', async () => {
    const calls: unknown[][] = [];
    const stats = {
      budgetStatus: async (...args: unknown[]) => {
        calls.push(['budgetStatus', ...args]);
        return STATUS;
      },
      billsUpcoming: async (...args: unknown[]) => {
        calls.push(['billsUpcoming', ...args]);
        return {
          currency: 'THB',
          fixedMonthlyMinor: 0,
          bills: [],
          dueSoonCount: 0,
          overdueCount: 0,
        };
      },
    } as unknown as ExpenseStatsService;
    const w = await new ExpenseTrackableModule(stats).summarizeToday(
      [entry({ amountMinor: 6500 }, { occurredAt: new Date('2026-09-18T02:00:00Z') })],
      ctx,
    );
    expect(calls).toEqual([
      ['budgetStatus', 'u1', undefined, ctx.now],
      ['billsUpcoming', 'u1', 2, ctx.now],
    ]);
    expect(w.headline).toBe('วันนี้ใช้ ฿65 · เดือนนี้ ฿8,420 / ฿15,000');
  });

  it('summarizeWeek: หมวดที่ใช้มากที่สุดพร้อมสัดส่วน', () => {
    const w = module.summarizeWeek(
      [
        entry({ amountMinor: 30000, category: 'food' }),
        entry({ amountMinor: 10000, category: 'transport' }),
      ],
      ctx,
    );
    expect(w.highlights).toEqual(['ใช้กับอาหารมากที่สุด ฿300 (75%)']);
  });

  const parse = (input: string) =>
    module.parseNaturalLanguage(parseNaturalText(input, nlContextOf(ctx)), ctx);

  it('parseNaturalLanguage: payload ผ่าน schema · รายจ่ายทั่วไป = ตอนนี้ ไม่เตือน', () => {
    const coffee = parse('กาแฟ 65')!;
    expect(coffee.occurredAt).toEqual(ctx.now);
    expect(coffee.rrule).toBeNull();
    expect(coffee.reminders).toEqual([]);
    expect(coffee.payload).toMatchObject({
      amountMinor: 6500,
      category: 'food',
      costType: 'variable',
    });
  });

  it('บิล "ทุกวันที่ 5" = กฎรายเดือน รอบแรกทั้งวัน + เตือนล่วงหน้า 1 วัน 09:00 (DoD Phase 5)', () => {
    const bill = parse('ค่าเน็ต 799 ทุกวันที่ 5')!;
    expect(bill.rrule).toBe('FREQ=MONTHLY;BYMONTHDAY=5');
    expect(bill.isAllDay).toBe(true);
    expect(bill.occurredAt?.toISOString()).toBe('2026-10-04T17:00:00.000Z'); // 5 ต.ค. 00:00 เวลาไทย
    expect(bill.reminders).toEqual([{ channel: 'push', offsetMinutes: -900 }]);
    expect(bill.payload).toMatchObject({ isBill: true, costType: 'fixed' });
    expect(() => expensePayloadSchema.parse(bill.payload)).not.toThrow();
  });

  it('ระบุวันเอง ("เมื่อวาน") → บันทึกย้อนหลังทั้งวัน', () => {
    const late = parse('ข้าวมันไก่ 50 เมื่อวาน')!;
    expect(late.occurredAt?.toISOString()).toBe('2026-09-16T17:00:00.000Z');
    expect(late.isAllDay).toBe(true);
  });

  it('ข้อความที่ไม่มีจำนวนเงิน → null (ให้โมดูล task รับไป)', () => {
    expect(parse('ประชุมทีม พรุ่งนี้')).toBeNull();
  });
});
