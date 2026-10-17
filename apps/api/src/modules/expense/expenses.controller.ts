import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  billsQuerySchema,
  parseExpenseSchema,
  type ExpenseParseDto,
  type ExpensePayload,
  periodQuerySchema,
  trendsQuerySchema,
  type BillsUpcomingDto,
  type ExpenseForecastDto,
  type ExpenseSummaryDto,
  type ExpenseTrendsDto,
} from '@nosion/contracts';
import { parseNaturalText } from '@nosion/core';
import { CurrentUser, PublicApi } from '../../common/decorators';
import { nlContextOf } from '../../core/parser/parser.service';
import { zodBody, zodQuery } from '../../common/zod-validation.pipe';
import { UserContextService } from '../../users/user-context.service';
import { ExpenseStatsService } from './expense-stats.service';
import { ExpenseTrackableModule } from './expense.trackable';

/**
 * endpoint เฉพาะโมดูลการเงิน (สเปก 7.3) — อ่านอย่างเดียว (parse = preview ไม่บันทึก)
 * CRUD ของรายการยังอยู่ที่ /entries ตัวกลาง
 */
@ApiTags('expenses')
@Controller('expenses')
@PublicApi()
export class ExpensesController {
  constructor(
    private readonly stats: ExpenseStatsService,
    private readonly expense: ExpenseTrackableModule,
    private readonly userContext: UserContextService,
  ) {}

  /** แปลง "กาแฟ 65" เป็น preview ของรายจ่าย — ใช้ parser เดียวกับ ⌘K (ไม่เขียนซ้ำฝั่งเว็บ) */
  @Post('parse')
  @HttpCode(HttpStatus.OK)
  async parse(
    @CurrentUser('userId') userId: string,
    @Body(zodBody(parseExpenseSchema)) dto: { text: string },
  ): Promise<ExpenseParseDto> {
    const ctx = await this.userContext.forUser(userId);
    const parsed = this.expense.parseNaturalLanguage(
      parseNaturalText(dto.text, nlContextOf(ctx)),
      ctx,
    );
    if (!parsed) return { result: null };
    return {
      result: {
        title: parsed.title,
        occurredAt: parsed.occurredAt?.toISOString() ?? null,
        isAllDay: parsed.isAllDay,
        payload: parsed.payload as ExpensePayload,
        confidence: parsed.confidence,
        matchedTokens: parsed.matchedTokens ?? [],
      },
    };
  }

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
