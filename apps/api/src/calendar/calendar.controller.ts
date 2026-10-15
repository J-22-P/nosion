import { Controller, Get, Query, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { calendarQuerySchema, type CalendarDto, type CalendarQuery } from '@nosion/contracts';
import type { Response } from 'express';
import { CurrentUser } from '../common/decorators';
import { zodQuery } from '../common/zod-validation.pipe';
import { CalendarService } from './calendar.service';

/** ปฏิทินรวมทุกโมดูล (สเปก 6.3 · 7.3 "Cross-module" · 8.11.4) */
@ApiTags('calendar')
@Controller('calendar')
export class CalendarController {
  constructor(private readonly calendar: CalendarService) {}

  /** `?from=2026-10-01&to=2026-10-31&module=task,expense` */
  @Get()
  async range(
    @CurrentUser('userId') userId: string,
    @Query(zodQuery(calendarQuerySchema)) query: CalendarQuery,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CalendarDto> {
    const started = performance.now();
    const result = await this.calendar.range(userId, query);
    // footer "Sync latency" ของหน้า Calendar อ่านค่านี้ (สเปก 8.11.4)
    res.setHeader('Server-Timing', `calendar;dur=${(performance.now() - started).toFixed(1)}`);
    return result;
  }
}
