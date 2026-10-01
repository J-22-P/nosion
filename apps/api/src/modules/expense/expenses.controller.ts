import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  billsQuerySchema,
  periodQuerySchema,
  trendsQuerySchema,
  type BillsUpcomingDto,
  type ExpenseForecastDto,
  type ExpenseSummaryDto,
  type ExpenseTrendsDto,
} from '@nosion/contracts';
import { CurrentUser } from '../../common/decorators';
import { zodQuery } from '../../common/zod-validation.pipe';
import { ExpenseStatsService } from './expense-stats.service';

/**
 * endpoint เฉพาะโมดูลการเงิน (สเปก 7.3) — อ่านอย่างเดียว
 * CRUD ของรายการยังอยู่ที่ /entries ตัวกลาง
 */
@ApiTags('expenses')
@Controller('expenses')
export class ExpensesController {
  constructor(private readonly stats: ExpenseStatsService) {}

  /** ยอดรวม แยกหมวด fixed vs variable — `?period=YYYY-MM` */
  @Get('summary')
  summary(
    @CurrentUser('userId') userId: string,
    @Query(zodQuery(periodQuerySchema)) q: { period?: string },
  ): Promise<ExpenseSummaryDto> {
    return this.stats.summary(userId, q.period);
  }

  /** การ์ด "คาดการณ์สิ้นเดือน" + sparkline */
  @Get('forecast')
  forecast(@CurrentUser('userId') userId: string): Promise<ExpenseForecastDto> {
    return this.stats.forecast(userId);
  }

  /** กราฟย้อนหลัง — `?months=6` (1–12) */
  @Get('trends')
  trends(
    @CurrentUser('userId') userId: string,
    @Query(zodQuery(trendsQuerySchema)) q: { months: number },
  ): Promise<ExpenseTrendsDto> {
    return this.stats.trends(userId, q.months);
  }

  /** การ์ด "บิลประจำ" — `?days=7` หน้าต่างใกล้ครบกำหนด */
  @Get('bills/upcoming')
  billsUpcoming(
    @CurrentUser('userId') userId: string,
    @Query(zodQuery(billsQuerySchema)) q: { days: number },
  ): Promise<BillsUpcomingDto> {
    return this.stats.billsUpcoming(userId, q.days);
  }
}
