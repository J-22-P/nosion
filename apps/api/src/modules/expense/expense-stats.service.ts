import { Injectable } from '@nestjs/common';
import type {
  BillsUpcomingDto,
  BudgetStatusDto,
  ExpenseCategory,
  ExpenseForecastDto,
  ExpenseSummaryDto,
  ExpenseTrendsDto,
} from '@nosion/contracts';
import { monthBoundsInTimeZone, periodBounds, type MonthBounds } from '@nosion/core';
import { EntryStatus, ModuleKey, type Prisma } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { UserContextService } from '../../users/user-context.service';
import { buildBudgetStatus, resolveTotalBudget, spentByCategory } from './budget-status';
import {
  buildBills,
  buildForecast,
  buildSummary,
  buildTrends,
  type AnalyticsEntry,
} from './expense-analytics';

const ENTRY_SELECT = {
  id: true,
  title: true,
  status: true,
  deletedAt: true,
  payload: true,
  occurredAt: true,
  createdAt: true,
  version: true,
} satisfies Prisma.EntrySelect;

/**
 * ตัวเลขสรุปของโมดูลการเงิน — อ่านอย่างเดียว · การคำนวณทั้งหมดอยู่ใน pure function
 *
 * category อยู่ใน payload (JSONB) จึง groupBy ด้วย Prisma ไม่ได้ → ดึงแถวของเดือนมารวมใน JS
 * ด้วยกฎ isSpent() ตัวเดียวกับ Today/Weekly (ถ้าเขียนซ้ำเป็น SQL วันหนึ่งตัวเลขจะไม่ตรงกัน)
 * รายการบุคคลต่อเดือนหลักร้อย → ไม่ใช่คอขวด · ถ้าเกินหลักหมื่นค่อยย้ายเป็น raw SQL + expression index
 */
@Injectable()
export class ExpenseStatsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly userContext: UserContextService,
  ) {}

  /** where ของรายการการเงินในช่วง [start, end) — ไม่มี occurredAt ให้ใช้วันที่สร้างแทน */
  static rangeWhere(userId: string, start: Date, end: Date): Prisma.EntryWhereInput {
    const range = { gte: start, lt: end };
    return {
      userId,
      module: ModuleKey.expense,
      deletedAt: null,
      status: { not: EntryStatus.cancelled },
      OR: [{ occurredAt: range }, { occurredAt: null, createdAt: range }],
    };
  }

  private async entriesBetween(userId: string, start: Date, end: Date): Promise<AnalyticsEntry[]> {
    const rows = await this.prisma.entry.findMany({
      where: ExpenseStatsService.rangeWhere(userId, start, end),
      select: ENTRY_SELECT,
    });
    return rows as AnalyticsEntry[];
  }

  private async context(userId: string, now: Date, period?: string) {
    const ctx = await this.userContext.forUser(userId, now);
    const bounds: MonthBounds = period
      ? periodBounds(period, ctx.timezone)
      : monthBoundsInTimeZone(now, ctx.timezone);
    return { ctx, bounds };
  }

  private activeBudgets(userId: string) {
    return this.prisma.budget
      .findMany({
        where: { userId, period: 'monthly', isActive: true },
        select: { category: true, amountMinor: true },
      })
      .then((rows) => rows.map((b) => ({ ...b, category: b.category as ExpenseCategory | null })));
  }

  async budgetStatus(userId: string, period?: string, now = new Date()): Promise<BudgetStatusDto> {
    const { ctx, bounds } = await this.context(userId, now, period);
    const [budgets, entries] = await Promise.all([
      this.activeBudgets(userId),
      this.entriesBetween(userId, bounds.start, bounds.end),
    ]);
    return buildBudgetStatus({
      bounds,
      timeZone: ctx.timezone,
      currency: ctx.currency,
      budgets,
      spent: spentByCategory(entries),
    });
  }

  async summary(userId: string, period?: string, now = new Date()): Promise<ExpenseSummaryDto> {
    const { ctx, bounds } = await this.context(userId, now, period);
    const entries = await this.entriesBetween(userId, bounds.start, bounds.end);
    return buildSummary(entries, bounds.period, ctx.currency);
  }

  /** เดือนปัจจุบันเท่านั้น — คาดการณ์เดือนที่จบแล้วไม่มีความหมาย */
  async forecast(userId: string, now = new Date()): Promise<ExpenseForecastDto> {
    const { ctx, bounds } = await this.context(userId, now);
    const [budgets, entries] = await Promise.all([
      this.activeBudgets(userId),
      this.entriesBetween(userId, bounds.start, bounds.end),
    ]);
    return buildForecast({
      entries,
      bounds,
      now,
      timeZone: ctx.timezone,
      currency: ctx.currency,
      budgetMinor: resolveTotalBudget(budgets).budgetMinor,
    });
  }

  /** `months` เดือนล่าสุด รวมเดือนปัจจุบัน — query เดียวทั้งช่วง แล้วแบ่งถังใน JS */
  async trends(userId: string, months: number, now = new Date()): Promise<ExpenseTrendsDto> {
    const { ctx, bounds } = await this.context(userId, now);
    const range = Array.from({ length: months }, (_, i) =>
      periodBounds(bounds.period, ctx.timezone, i - (months - 1)),
    );
    const entries = await this.entriesBetween(userId, range[0]!.start, bounds.end);
    return { currency: ctx.currency, points: buildTrends(entries, range, ctx.timezone) };
  }

  /** บิลของเดือนนี้ + บิลที่ยังค้างจ่ายจากเดือนก่อน (ไม่ให้หายไปเพราะข้ามเดือน) */
  async billsUpcoming(userId: string, days: number, now = new Date()): Promise<BillsUpcomingDto> {
    const { ctx, bounds } = await this.context(userId, now);
    const rows = await this.prisma.entry.findMany({
      where: {
        userId,
        module: ModuleKey.expense,
        deletedAt: null,
        status: { not: EntryStatus.cancelled },
        payload: { path: ['isBill'], equals: true },
        OR: [
          { occurredAt: { gte: bounds.start, lt: bounds.end } },
          { occurredAt: { lt: bounds.start }, status: { not: EntryStatus.done } },
        ],
      },
      select: ENTRY_SELECT,
    });
    return buildBills({
      entries: rows as AnalyticsEntry[],
      bounds,
      now,
      timeZone: ctx.timezone,
      currency: ctx.currency,
      days,
    });
  }
}
