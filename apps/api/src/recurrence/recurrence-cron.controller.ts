import {
  Controller,
  Get,
  Headers,
  Inject,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { timingSafeEqual } from 'node:crypto';
import { Public } from '../common/decorators';
import { APP_CONFIG, type AppConfig } from '../infra/config/env';
import { RecurrenceService } from './recurrence.service';

/**
 * งาน cron รายวันของ Recurrence Engine (สเปก 6.1: 03:00 UTC)
 *
 * API รันเป็น Vercel Function ไม่มี process ค้างให้ตั้ง cron ภายใน → ให้ Vercel Cron เรียก endpoint นี้
 * (apps/api/vercel.json) พร้อม `Authorization: Bearer $CRON_SECRET` · เมื่อ worker (Phase 4) deploy แล้ว
 * worker เรียก RecurrenceService.materializeDue() ตัวเดียวกันได้ — logic อยู่ที่ service ไม่ใช่ที่นี่
 */
@ApiExcludeController()
@Controller('internal/cron')
export class RecurrenceCronController {
  constructor(
    private readonly recurrence: RecurrenceService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Public()
  @Get('recurrence')
  run(@Headers('authorization') authorization: string | undefined) {
    const secret = this.config.CRON_SECRET;
    // ไม่ได้ตั้ง secret = ไม่เปิด endpoint เลย (ดีกว่าเปิดแบบไม่มีการป้องกัน)
    if (!secret) throw new NotFoundException();
    if (!matches(authorization ?? '', `Bearer ${secret}`)) throw new UnauthorizedException();
    return this.recurrence.materializeDue();
  }
}

/** เทียบแบบเวลาคงที่ — กันเดา secret ทีละตัวอักษรจากเวลาตอบกลับ */
export function matches(received: string, expected: string): boolean {
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
