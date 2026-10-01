import { expensePayloadSchema, type ExpensePayload } from '@nosion/contracts';
import { type Entry, type UserContext } from '@nosion/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { ExpenseTrackableModule, isSpent, sumSpent } from './expense.trackable';

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
    module = new ExpenseTrackableModule();
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

  it('summarizeToday: ยอดใช้วันนี้ไม่มีทศนิยม · รายรับมีเครื่องหมาย +', () => {
    const w = module.summarizeToday(
      [
        entry({ amountMinor: 6500 }),
        entry({ amountMinor: 27500 }, { id: 'e2', title: 'ข้าวเย็น' }),
        entry({ amountMinor: 30000, direction: 'income' }, { id: 'e3', title: 'ขายของ' }),
      ],
      ctx,
    );
    expect(w.headline).toBe('วันนี้ใช้ ฿340');
    expect(w.items.find((i) => i.entryId === 'e3')?.detail).toBe('+฿300.00');
    expect(w.items.find((i) => i.entryId === 'e1')?.detail).toBe('−฿65.00');
  });

  it('summarizeToday: ไม่มีรายการ → empty state พร้อม CTA', () => {
    const w = module.summarizeToday([], ctx);
    expect(w.isEmpty).toBe(true);
    expect(w.emptyCta?.href).toBe('/expenses?new=1');
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

  it('parseNaturalLanguage: payload ผ่าน schema และบิลเป็นต้นทุนคงที่ทั้งวัน', () => {
    const coffee = module.parseNaturalLanguage('กาแฟ 65', ctx)!;
    expect(coffee.occurredAt).toEqual(ctx.now);
    expect(coffee.payload).toMatchObject({
      amountMinor: 6500,
      category: 'food',
      costType: 'variable',
    });

    const bill = module.parseNaturalLanguage('ค่าเน็ต 799 ทุกวันที่ 5', ctx)!;
    expect(bill.isAllDay).toBe(true);
    expect(bill.payload).toMatchObject({ isBill: true, costType: 'fixed' });
    expect(() => expensePayloadSchema.parse(bill.payload)).not.toThrow();
  });

  it('ข้อความที่ไม่มีจำนวนเงิน → null (ให้โมดูล task รับไป)', () => {
    expect(module.parseNaturalLanguage('ประชุมทีม พรุ่งนี้', ctx)).toBeNull();
  });
});
