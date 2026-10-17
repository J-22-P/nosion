import type {
  BillDto,
  BillsUpcomingDto,
  BudgetStatusDto,
  ExpenseCategory,
  ExpensePayload,
} from '@nosion/contracts';
import {
  formatInTimeZone,
  formatMoney,
  intlLocaleOf,
  text,
  type Entry,
  type Lang,
  type TodayWidget,
  type TodayWidgetAlert,
} from '@nosion/core';
import { isSpent } from './spend-rules';

const MAX_ALERTS = 3;
const LEVEL_RANK: Record<TodayWidgetAlert['level'], number> = { danger: 0, warning: 1, info: 2 };

/** ข้อความวันครบกำหนดแบบคนพูด */
function dueText(b: BillDto, lang: Lang): string {
  const d = b.daysUntilDue ?? 0;
  if (d < 0) return text(lang, 'expense.due.overdue', { days: -d });
  if (d === 0) return text(lang, 'expense.due.today');
  if (d === 1) return text(lang, 'expense.due.tomorrow');
  return text(lang, 'expense.due.inDays', { days: d });
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
  lang?: Lang;
}): TodayWidget {
  const { status, bills, timeZone } = input;
  const lang = input.lang ?? 'th';
  const locale = intlLocaleOf(lang);
  const currency = status.currency;
  const money = (minor: number) => formatMoney(minor, currency, { decimals: false, locale });
  const category = (c: ExpenseCategory) => text(lang, `category.${c}`);
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
      ? text(lang, 'expense.today.monthBudget', {
          spent: money(month.spentMinor),
          budget: money(month.budgetMinor),
        })
      : text(lang, 'expense.today.month', { spent: money(month.spentMinor) });

  const alerts: TodayWidgetAlert[] = [];
  if (month.tone === 'over') {
    alerts.push({ level: 'danger', message: text(lang, 'expense.today.overBudget') });
  }
  for (const c of status.categories) {
    if (c.ratio === null || c.tone === 'safe') continue;
    const pct = Math.round(c.ratio * 100);
    alerts.push(
      c.tone === 'over'
        ? {
            level: 'danger',
            message: text(lang, 'expense.today.categoryOver', {
              category: category(c.category),
              pct: pct - 100,
            }),
          }
        : {
            level: 'warning',
            message: text(lang, 'expense.today.categoryWarning', {
              category: category(c.category),
              pct,
            }),
          },
    );
  }
  const unpaid = bills.bills.filter((b) => !b.paid && b.daysUntilDue !== null);
  for (const b of unpaid) {
    if (b.daysUntilDue! > 1) continue;
    alerts.push({
      level: b.daysUntilDue! < 0 ? 'warning' : 'info',
      message: `${b.title} ${formatMoney(b.amountMinor, b.currency, { locale })} ${dueText(b, lang)}`,
    });
  }
  alerts.sort((a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level]);

  // บิลที่ควรเห็นที่สุด: เลยกำหนดก่อน แล้วค่อยใกล้ครบ (bills เรียงตามวันครบกำหนดอยู่แล้ว)
  const nextBill = unpaid[0] ?? null;

  return {
    module: 'expense',
    title: text(lang, 'expense.today.title'),
    order: 20,
    headline: text(lang, 'expense.today.headline', {
      spent: money(todaySpentMinor),
      month: monthPart,
    }),
    subline: nextBill ? `${nextBill.title} ${dueText(nextBill, lang)}` : undefined,
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
          detail: `${p.direction === 'income' ? '+' : '−'}${formatMoney(Math.abs(p.amountMinor), p.currency, { locale })}`,
        };
      }),
    isEmpty: todays.length === 0 && month.spentMinor === 0 && bills.bills.length === 0,
    emptyCta: { label: text(lang, 'expense.today.empty'), href: '/expenses?new=1' },
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
