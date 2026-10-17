import {
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  calendarQuerySchema,
  type CalendarDto,
  type CalendarFeedDto,
  type CalendarQuery,
} from '@nosion/contracts';
import type { Response } from 'express';
import { RateLimitGuard } from '../auth/guards/rate-limit.guard';
import { CurrentUser, Public, PublicApi, RateLimit } from '../common/decorators';
import { zodQuery } from '../common/zod-validation.pipe';
import { CalendarService } from './calendar.service';

/** ปฏิทินรวมทุกโมดูล (สเปก 6.3 · 7.3 "Cross-module" · 8.11.4) */
@ApiTags('calendar')
@Controller('calendar')
@PublicApi()
// guard อ่าน @RateLimit เฉพาะ handler ที่ติดไว้ (rotate, .ics)
@UseGuards(RateLimitGuard)
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

  /** ลิงก์ iCal ของผู้ใช้ — ประกาศก่อน `:token.ics` */
  @Get('feed')
  feed(@CurrentUser('userId') userId: string): Promise<CalendarFeedDto> {
    return this.calendar.feed(userId);
  }

  @Post('feed/rotate')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ limit: 10, windowSeconds: 3600, by: 'user' })
  rotate(@CurrentUser('userId') userId: string): Promise<CalendarFeedDto> {
    return this.calendar.rotateFeed(userId);
  }

  /**
   * ดาวน์โหลด .ics ครั้งเดียวของช่วงวันที่ (เช่น เดือนที่เปิดดูอยู่) — ต่างจาก feed ที่ subscribe แล้วอัปเดตเอง
   * นำเข้าแล้วเป็นสำเนา: งานที่เพิ่มทีหลังไม่ตามไป · ประกาศก่อน `:token.ics`
   */
  @Get('export')
  @RateLimit({ limit: 30, windowSeconds: 60, by: 'user' })
  @Header('Content-Type', 'text/calendar; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  async export(
    @CurrentUser('userId') userId: string,
    @Query(zodQuery(calendarQuerySchema)) query: CalendarQuery,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    res.setHeader('Content-Disposition', `attachment; filename="nosion-${query.from}.ics"`);
    return this.calendar.exportRange(userId, query);
  }

  /**
   * iCal feed — ไม่ต้องล็อกอิน: token ใน URL คือ credential (สเปก 7.3)
   * Google/Apple ดึงจาก server ของเขาเอง จึงนับ rate limit ต่อ IP แบบหลวม ๆ
   */
  @Public()
  @Get(':token.ics')
  @RateLimit({ limit: 120, windowSeconds: 60, by: 'ip' })
  @Header('Content-Type', 'text/calendar; charset=utf-8')
  @Header('Content-Disposition', 'inline; filename="nosion.ics"')
  @Header('Cache-Control', 'private, max-age=300')
  ics(@Param('token') token: string): Promise<string> {
    return this.calendar.ics(token);
  }
}
