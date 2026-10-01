import type { BillDto, BillsUpcomingDto, BudgetStatusDto, ExpensePayload } from '@nosion/contracts';
import {
  formatInTimeZone,
  formatMoney,
  type Entry,
  type TodayWidget,
  type TodayWidgetAlert,
} from '@nosion/core';
import { CATEGORY_LABEL_TH } from './expense-labels';
import { isSpent } from './spend-rules';

const MAX_ALERTS = 3;
const LEVEL_RANK: Record<TodayWidgetAlert['level'], number> = { danger: 0, warning: 1, info: 2 };

/** ข้อความวันครบกำหนดแบบคนพูด */
function dueText(b: BillDto): string {
  const d = b.daysUntilDue ?? 0;
  if (d < 0) return `เลยกำหนด ${-d} วัน`;
  if (d === 0) return 'ครบกำหนดวันนี้';
  if (d === 1) return 'ครบกำหนดพรุ่งนี้';
  return `ครบกำหนดอีก ${d} วัน`;
}

/**
 * การ์ดการเงินของหน้า Today (สเปก 7.4, 8.11.1) — pure function
 *
 * entries = รายการการเงินที่ core ส่งมา (เกิดวันนี้ / ค้างถึงวันนี้ / เสร็จวันนี้)
 * status, bills = ข้อมูลทั้งเดือนจาก ExpenseStatsService
 */
export function buildExpenseTodayWidget(input: {
  entries: Entry[];
  status: BudgetStatusDto;
  bills: BillsUpcomingDto;
  timeZone: string;
  now: Date;
}): TodayWidget {
  const { status, bills, timeZone } = input;
  const currency = status.currency;
  const money = (minor: number) => formatMoney(minor, currency, { decimals: false });
  const today = formatInTimeZone(input.now, timeZone);

  // "วันนี้" = วันที่ของรายการตรงกับวันนี้ (บิลค้างจากเมื่อวานที่ core ส่งมาไม่นับเป็นรายจ่ายวันนี้)
  const todays = input.entries.filter(
    (e) => formatInTimeZone(e.occurredAt ?? e.createdAt, timeZone) === today,
  );
  const todaySpentMinor = todays
    .filter(isSpent)
    .reduce((sum, e) => sum + (e.payload as ExpensePayload).amountMinor, 0);

  const month = status.total;
  const monthPart =
    month.budgetMinor !== null
      ? `เดือนนี้ ${money(month.spentMinor)} / ${money(month.budgetMinor)}`
      : `เดือนนี้ ${money(month.spentMinor)}`;

  const alerts: TodayWidgetAlert[] = [];
  if (month.tone === 'over') alerts.push({ level: 'danger', message: 'เดือนนี้ใช้เกินงบรวมแล้ว' });
  for (const c of status.categories) {
    if (c.ratio === null || c.tone === 'safe') continue;
    const pct = Math.round(c.ratio * 100);
    alerts.push(
      c.tone === 'over'
        ? { level: 'danger', message: `หมวด${CATEGORY_LABEL_TH[c.category]}เกินงบ ${pct - 100}%` }
        : {
            level: 'warning',
            message: `หมวด${CATEGORY_LABEL_TH[c.category]}ใช้ไป ${pct}% ของงบแล้ว`,
          },
    );
  }
  const unpaid = bills.bills.filter((b) => !b.paid && b.daysUntilDue !== null);
  for (const b of unpaid) {
    if (b.daysUntilDue! > 1) continue;
    alerts.push({
      level: b.daysUntilDue! < 0 ? 'warning' : 'info',
      message: `${b.title} ${formatMoney(b.amountMinor, b.currency)} ${dueText(b)}`,
    });
  }
  alerts.sort((a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level]);

  // บิลที่ควรเห็นที่สุด: เลยกำหนดก่อน แล้วค่อยใกล้ครบ (bills เรียงตามวันครบกำหนดอยู่แล้ว)
  const nextBill = unpaid[0] ?? null;

  return {
    module: 'expense',
    title: 'การเงินและงบประมาณ',
    order: 20,
    headline: `วันนี้ใช้ ${money(todaySpentMinor)} · ${monthPart}`,
    subline: nextBill ? `${nextBill.title} ${dueText(nextBill)}` : undefined,
    progress: { done: month.spentMinor, total: month.budgetMinor },
    alerts: alerts.slice(0, MAX_ALERTS),
    items: todays
      .filter((e) => e.status !== 'cancelled')
      .sort((a, b) => (b.occurredAt?.getTime() ?? 0) - (a.occurredAt?.getTime() ?? 0))
      .slice(0, 5)
      .map((e) => {
        const p = e.payload as ExpensePayload;
        return {
          entryId: e.id,
          title: e.title,
          status: e.status,
          occurredAt: e.occurredAt,
          detail: `${p.direction === 'income' ? '+' : '−'}${formatMoney(Math.abs(p.amountMinor), p.currency)}`,
        };
      }),
    isEmpty: todays.length === 0 && month.spentMinor === 0 && bills.bills.length === 0,
    emptyCta: { label: 'บันทึกรายจ่ายแรก', href: '/expenses?new=1' },
    data: {
      currency,
      todaySpentMinor,
      monthSpentMinor: month.spentMinor,
      budgetMinor: month.budgetMinor,
      budgetTone: month.tone,
      nextBill,
    },
  };
}
