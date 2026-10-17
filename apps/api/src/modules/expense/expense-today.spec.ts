import {
  expensePayloadSchema,
  type BillDto,
  type BillsUpcomingDto,
  type BudgetStatusDto,
  type ExpensePayload,
} from '@nosion/contracts';
import type { Entry } from '@nosion/core';
import { describe, expect, it } from 'vitest';
import { buildExpenseTodayWidget } from './expense-today';

const TZ = 'Asia/Bangkok';
/** 18 ก.ย. 2026 10:00 เวลาไทย */
const NOW = new Date('2026-09-18T03:00:00Z');

let seq = 0;
const entry = (
  p: Partial<ExpensePayload> & { amountMinor: number },
  over: Partial<Entry> = {},
): Entry => ({
  id: `e${++seq}`,
  userId: 'u1',
  module: 'expense',
  title: `รายการ ${seq}`,
  description: null,
  status: 'done',
  priority: 'none',
  occurredAt: new Date('2026-09-18T02:00:00Z'),
  isAllDay: false,
  completedAt: null,
  payload: expensePayloadSchema.parse(p),
  projectId: null,
  parentId: null,
  recurrenceRuleId: null,
  recurrenceSlot: null,
  sortOrder: 0,
  clientId: null,
  version: 1,
  createdAt: new Date('2026-09-18T02:00:00Z'),
  updatedAt: new Date(),
  deletedAt: null,
  ...over,
});

const status = (over: Partial<BudgetStatusDto> = {}): BudgetStatusDto => ({
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
  ...over,
});

const bill = (over: Partial<BillDto>): BillDto => ({
  id: 'b1',
  title: 'ค่าเน็ต',
  amountMinor: 79900,
  currency: 'THB',
  dueDate: '2026-09-19',
  paid: false,
  paymentMethod: 'card',
  daysUntilDue: 1,
  version: 1,
  ...over,
});

const bills = (list: BillDto[] = []): BillsUpcomingDto => ({
  currency: 'THB',
  fixedMonthlyMinor: list.reduce((a, b) => a + b.amountMinor, 0),
  bills: list,
  dueSoonCount: 0,
  overdueCount: 0,
});

const build = (entries: Entry[], s = status(), b = bills()) =>
  buildExpenseTodayWidget({ entries, status: s, bills: b, timeZone: TZ, now: NOW });

describe('buildExpenseTodayWidget', () => {
  it('headline ตามสเปก 7.4: วันนี้ใช้ ฿340 · เดือนนี้ ฿8,420 / ฿15,000', () => {
    const w = build([entry({ amountMinor: 6500 }), entry({ amountMinor: 27500 })]);
    expect(w.headline).toBe('วันนี้ใช้ ฿340 · เดือนนี้ ฿8,420 / ฿15,000');
    expect(w.progress).toEqual({ done: 842000, total: 1500000 });
    expect(w.data).toMatchObject({
      todaySpentMinor: 34000,
      monthSpentMinor: 842000,
      budgetTone: 'safe',
    });
  });

  it('ไม่มีงบ → แสดงเฉพาะยอดเดือน · progress total null', () => {
    const s = status({
      total: {
        spentMinor: 842000,
        budgetMinor: null,
        ratio: null,
        tone: 'safe',
        budgetSource: 'none',
      },
    });
    const w = build([], s);
    expect(w.headline).toBe('วันนี้ใช้ ฿0 · เดือนนี้ ฿8,420');
    expect(w.progress?.total).toBeNull();
  });

  it('บิลค้างจากเมื่อวานที่ core ส่งมา ไม่นับเป็นรายจ่ายวันนี้ และไม่อยู่ใน items', () => {
    const w = build([
      entry({ amountMinor: 6500 }),
      entry(
        { amountMinor: 50000, isBill: true },
        { status: 'pending', occurredAt: new Date('2026-09-16T17:00:00Z') }, // 17 ก.ย. เวลาไทย
      ),
    ]);
    expect(w.data?.todaySpentMinor).toBe(6500);
    expect(w.items).toHaveLength(1);
  });

  it('รายรับมี + · รายจ่ายมี − ใน items', () => {
    const w = build([
      entry({ amountMinor: 30000, direction: 'income' }, { title: 'ขายของ' }),
      entry({ amountMinor: 6500 }, { title: 'กาแฟ' }),
    ]);
    expect(Object.fromEntries(w.items.map((i) => [i.title, i.detail]))).toEqual({
      ขายของ: '+฿300.00',
      กาแฟ: '−฿65.00',
    });
  });

  it('alerts ตามสเปก: หมวด 87% = warning · บิลพรุ่งนี้ = info · เรียง danger > warning > info · ไม่เกิน 3', () => {
    const s = status({
      total: {
        spentMinor: 1600000,
        budgetMinor: 1500000,
        ratio: 1.07,
        tone: 'over',
        budgetSource: 'total',
      },
      categories: [
        { category: 'food', spentMinor: 435000, budgetMinor: 500000, ratio: 0.87, tone: 'warning' },
        {
          category: 'transport',
          spentMinor: 224000,
          budgetMinor: 200000,
          ratio: 1.12,
          tone: 'over',
        },
        { category: 'health', spentMinor: 1000, budgetMinor: 100000, ratio: 0.01, tone: 'safe' },
      ],
    });
    const w = build([], s, bills([bill({})]));
    expect(w.alerts).toEqual([
      { level: 'danger', message: 'เดือนนี้ใช้เกินงบรวมแล้ว' },
      { level: 'danger', message: 'หมวดเดินทางเกินงบ 12%' },
      { level: 'warning', message: 'หมวดอาหารใช้ไป 87% ของงบแล้ว' },
    ]);
  });

  it('บิลเลยกำหนด = warning · บิลอีก 5 วันไม่เตือน · subline บอกบิลที่ใกล้ที่สุด', () => {
    const w = build(
      [],
      status(),
      bills([
        bill({
          id: 'old',
          title: 'ค่าโทร',
          amountMinor: 50000,
          dueDate: '2026-09-15',
          daysUntilDue: -3,
        }),
        bill({ id: 'far', title: 'AWS', dueDate: '2026-09-23', daysUntilDue: 5 }),
      ]),
    );
    expect(w.alerts).toEqual([{ level: 'warning', message: 'ค่าโทร ฿500.00 เลยกำหนด 3 วัน' }]);
    expect(w.subline).toBe('ค่าโทร เลยกำหนด 3 วัน');
  });

  it('ไม่มีอะไรเลย → empty state พร้อม CTA', () => {
    const s = status({
      total: { spentMinor: 0, budgetMinor: null, ratio: null, tone: 'safe', budgetSource: 'none' },
    });
    const w = build([], s);
    expect(w.isEmpty).toBe(true);
    expect(w.emptyCta?.href).toBe('/expenses?new=1');
  });

  it('ผู้ใช้ภาษาอังกฤษ → การ์ดทั้งใบเป็นภาษาอังกฤษ (ชื่อบิลเป็นข้อมูลของผู้ใช้ คงเดิม)', () => {
    const w = buildExpenseTodayWidget({
      entries: [entry({ amountMinor: 6500 }), entry({ amountMinor: 27500 })],
      status: status(),
      bills: bills([bill({ id: 'late', title: 'ค่าโทร', amountMinor: 50000, daysUntilDue: -3 })]),
      timeZone: TZ,
      now: NOW,
      lang: 'en',
    });
    expect(w.title).toBe('Money & budget');
    expect(w.headline).toBe('Spent ฿340 today · This month ฿8,420 / ฿15,000');
    expect(w.alerts).toContainEqual({ level: 'warning', message: 'ค่าโทร ฿500.00 3 days overdue' });
    expect(w.emptyCta?.label).toBe('Record your first expense');
  });
});
