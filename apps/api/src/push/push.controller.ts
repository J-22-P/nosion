import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  notificationActionSchema,
  pushSubscribeSchema,
  pushUnsubscribeSchema,
  type NotificationActionInput,
  type PushConfigDto,
  type PushSubscribeInput,
} from '@nosion/contracts';
import { verifyActionToken } from '@nosion/core';
import { RateLimitGuard } from '../auth/guards/rate-limit.guard';
import { CurrentUser, Public, RateLimit } from '../common/decorators';
import { zodBody } from '../common/zod-validation.pipe';
import { EntriesService } from '../entries/entries.service';
import { APP_CONFIG, type AppConfig } from '../infra/config/env';
import { PushService } from './push.service';

/** Web Push (ตาราง endpoint "Recurrence & Reminder" ของสเปก 7.x + 10.3) */
@ApiTags('push')
@Controller()
@UseGuards(RateLimitGuard)
export class PushController {
  constructor(
    private readonly push: PushService,
    private readonly entries: EntriesService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** VAPID public key — เบราว์เซอร์ต้องใช้ตอน pushManager.subscribe() */
  @Get('push/config')
  getConfig(): PushConfigDto {
    return { publicKey: this.config.VAPID_PUBLIC_KEY ?? null };
  }

  @Post('push/subscribe')
  @HttpCode(HttpStatus.NO_CONTENT)
  async subscribe(
    @CurrentUser('userId') userId: string,
    @Body(zodBody(pushSubscribeSchema)) dto: PushSubscribeInput,
  ): Promise<void> {
    await this.push.subscribe(userId, dto);
  }

  @Delete('push/unsubscribe')
  @HttpCode(HttpStatus.NO_CONTENT)
  async unsubscribe(
    @CurrentUser('userId') userId: string,
    @Body(zodBody(pushUnsubscribeSchema)) dto: { endpoint: string },
  ): Promise<void> {
    await this.push.unsubscribe(userId, dto.endpoint);
  }

  /**
   * ปุ่ม "จ่ายแล้ว / เลื่อน 1 วัน" ใน notification (สเปก 10.3) — service worker เรียกโดยไม่มี access token
   * ยืนยันตัวตนด้วย action token ที่ worker เซ็นไว้ (ผูก user + entry · หมดอายุ 7 วัน)
   */
  @Public()
  @Post('notifications/actions')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RateLimit({ limit: 30, windowSeconds: 60 })
  async action(
    @Body(zodBody(notificationActionSchema)) dto: NotificationActionInput,
  ): Promise<void> {
    const secret = this.config.NOTIFICATION_ACTION_SECRET;
    if (!secret) throw new NotFoundException();
    const claims = verifyActionToken(dto.token, secret);
    if (!claims) throw new UnauthorizedException('ลิงก์ในการแจ้งเตือนหมดอายุหรือไม่ถูกต้อง');
    if (dto.action === 'complete') await this.entries.complete(claims.userId, claims.entryId);
    else await this.entries.defer(claims.userId, claims.entryId, 'tomorrow');
  }
}
