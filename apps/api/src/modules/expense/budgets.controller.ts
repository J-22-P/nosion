import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  createBudgetSchema,
  periodQuerySchema,
  updateBudgetSchema,
  type BudgetDto,
  type BudgetStatusDto,
  type CreateBudgetInput,
  type UpdateBudgetInput,
} from '@nosion/contracts';
import { CurrentUser } from '../../common/decorators';
import { zodBody, zodQuery } from '../../common/zod-validation.pipe';
import { BudgetsService } from './budgets.service';
import { ExpenseStatsService } from './expense-stats.service';

/** งบประมาณรายเดือน (สเปก 7.3) */
@ApiTags('budgets')
@Controller('budgets')
export class BudgetsController {
  constructor(
    private readonly budgets: BudgetsService,
    private readonly stats: ExpenseStatsService,
  ) {}

  @Get()
  list(@CurrentUser('userId') userId: string): Promise<BudgetDto[]> {
    return this.budgets.list(userId);
  }

  /** ใช้ไปกี่ % ของงบรวมและแต่ละหมวด — KPI "รายจ่ายเดือนนี้" และ bar หมวดหมู่ */
  @Get('status')
  status(
    @CurrentUser('userId') userId: string,
    @Query(zodQuery(periodQuerySchema)) query: { period?: string },
  ): Promise<BudgetStatusDto> {
    return this.stats.budgetStatus(userId, query.period);
  }

  @Post()
  create(
    @CurrentUser('userId') userId: string,
    @Body(zodBody(createBudgetSchema)) dto: CreateBudgetInput,
  ): Promise<BudgetDto> {
    return this.budgets.create(userId, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
    @Body(zodBody(updateBudgetSchema)) dto: UpdateBudgetInput,
  ): Promise<BudgetDto> {
    return this.budgets.update(userId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentUser('userId') userId: string, @Param('id') id: string): Promise<void> {
    await this.budgets.remove(userId, id);
  }
}
