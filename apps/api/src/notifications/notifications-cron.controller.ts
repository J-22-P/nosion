import {
  Controller,
  Get,
  Headers,
  Inject,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '../common/decorators';
import { APP_CONFIG, type AppConfig } from '../infra/config/env';
import { matches } from '../recurrence/recurrence-cron.controller';
import { NotificationsCronService } from './notifications-cron.service';

/**
 * การเตือนและสรุปรายวันบน Vercel (ไม่มี worker) — ตัวเรียกภายนอกยิงตามรอบ:
 *   GET /internal/cron/reminders  ทุก 1 นาที  (Vercel Cron แผน Hobby รันได้วันละครั้ง จึงใช้ cron-job.org)
 *   GET /internal/cron/digest     ทุก 15 นาที (สเปก 10.2)
 * ป้องกันด้วย CRON_SECRET ตัวเดียวกับ /internal/cron/recurrence · ไม่ตั้ง = 404 (ปิด)
 * ถ้า worker บน Fly.io ทำงานอยู่ ไม่ต้องเรียก endpoint นี้ (ทำงานแทนกัน ไม่ใช่ทำคู่กัน)
 */
@ApiExcludeController()
@Controller('internal/cron')
export class NotificationsCronController {
  constructor(
    private readonly notifications: NotificationsCronService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Public()
  @Get('reminders')
  reminders(@Headers('authorization') authorization: string | undefined) {
    this.authorize(authorization);
    return this.notifications.reminders();
  }

  @Public()
  @Get('digest')
  digest(@Headers('authorization') authorization: string | undefined) {
    this.authorize(authorization);
    return this.notifications.digest();
  }

  private authorize(authorization: string | undefined): void {
    const secret = this.config.CRON_SECRET;
    if (!secret) throw new NotFoundException();
    if (!matches(authorization ?? '', `Bearer ${secret}`)) throw new UnauthorizedException();
  }
}
