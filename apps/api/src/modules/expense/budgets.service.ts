import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  BudgetDto,
  CreateBudgetInput,
  ExpenseCategory,
  UpdateBudgetInput,
} from '@nosion/contracts';
import { Prisma, type Budget } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { UserContextService } from '../../users/user-context.service';

/** งบรายเดือนเท่านั้นในตอนนี้ (สเปกเผื่อ period อื่นไว้ใน schema) */
const PERIOD = 'monthly';

/** CRUD ของงบประมาณ — ทุก query ใส่ userId เอง (ไม่พึ่ง extension อย่างเดียว เหมือน TaskStatsService) */
@Injectable()
export class BudgetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly userContext: UserContextService,
  ) {}

  async list(userId: string): Promise<BudgetDto[]> {
    const rows = await this.prisma.budget.findMany({
      where: { userId, period: PERIOD },
      // งบรวม (category null) ขึ้นก่อน แล้วเรียงตามชื่อหมวด
      orderBy: [{ category: { sort: 'asc', nulls: 'first' } }],
    });
    return rows.map(toBudgetDto);
  }

  async create(userId: string, input: CreateBudgetInput): Promise<BudgetDto> {
    const ctx = await this.userContext.forUser(userId);
    try {
      const row = await this.prisma.budget.create({
        data: { userId, ...input, currency: ctx.currency, period: PERIOD },
      });
      return toBudgetDto(row);
    } catch (err) {
      // ชนทั้ง unique (userId, category, period) และ partial index ของงบรวม (category IS NULL)
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException(
          input.category === null
            ? 'ตั้งงบรวมไว้แล้ว — แก้ไขก้อนเดิมแทน'
            : `หมวด ${input.category} มีงบอยู่แล้ว`,
        );
      }
      throw err;
    }
  }

  async update(userId: string, id: string, input: UpdateBudgetInput): Promise<BudgetDto> {
    const result = await this.prisma.budget.updateMany({ where: { id, userId }, data: input });
    if (result.count === 0) throw new NotFoundException('ไม่พบงบประมาณ');
    return toBudgetDto(await this.prisma.budget.findFirstOrThrow({ where: { id, userId } }));
  }

  async remove(userId: string, id: string): Promise<void> {
    const result = await this.prisma.budget.deleteMany({ where: { id, userId } });
    if (result.count === 0) throw new NotFoundException('ไม่พบงบประมาณ');
  }
}

function toBudgetDto(row: Budget): BudgetDto {
  return {
    id: row.id,
    category: row.category as ExpenseCategory | null,
    amountMinor: row.amountMinor,
    currency: row.currency,
    period: PERIOD,
    alertThreshold: row.alertThreshold,
    isActive: row.isActive,
  };
}
