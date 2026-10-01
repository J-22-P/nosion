import { Injectable } from '@nestjs/common';
import type { BudgetStatusDto, ExpenseCategory } from '@nosion/contracts';
import { monthBoundsInTimeZone, periodBounds, type MonthBounds } from '@nosion/core';
import { EntryStatus, ModuleKey, type Prisma } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { UserContextService } from '../../users/user-context.service';
import { buildBudgetStatus, spentByCategory } from './budget-status';
import type { SpendableEntry } from './expense.trackable';

/**
 * ตัวเลขสรุปของโมดูลการเงิน — อ่านอย่างเดียว
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

  /** where ของรายการการเงินในเดือนหนึ่ง — ไม่มี occurredAt ให้ใช้วันที่สร้างแทน */
  static monthWhere(userId: string, bounds: MonthBounds): Prisma.EntryWhereInput {
    const range = { gte: bounds.start, lt: bounds.end };
    return {
      userId,
      module: ModuleKey.expense,
      deletedAt: null,
      status: { not: EntryStatus.cancelled },
      OR: [{ occurredAt: range }, { occurredAt: null, createdAt: range }],
    };
  }

  async monthEntries(userId: string, bounds: MonthBounds): Promise<SpendableEntry[]> {
    const rows = await this.prisma.entry.findMany({
      where: ExpenseStatsService.monthWhere(userId, bounds),
      select: { status: true, deletedAt: true, payload: true },
    });
    return rows as SpendableEntry[];
  }

  async budgetStatus(
    userId: string,
    period?: string,
    now: Date = new Date(),
  ): Promise<BudgetStatusDto> {
    const ctx = await this.userContext.forUser(userId, now);
    const bounds = period
      ? periodBounds(period, ctx.timezone)
      : monthBoundsInTimeZone(now, ctx.timezone);

    const [budgets, entries] = await Promise.all([
      this.prisma.budget.findMany({
        where: { userId, period: 'monthly', isActive: true },
        select: { category: true, amountMinor: true },
      }),
      this.monthEntries(userId, bounds),
    ]);

    return buildBudgetStatus({
      bounds,
      timeZone: ctx.timezone,
      currency: ctx.currency,
      budgets: budgets.map((b) => ({ ...b, category: b.category as ExpenseCategory | null })),
      spent: spentByCategory(entries),
    });
  }
}
