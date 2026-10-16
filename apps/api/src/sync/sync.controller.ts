import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  syncPullSchema,
  syncPushSchema,
  type SyncPullDto,
  type SyncPullQuery,
  type SyncPushDto,
  type SyncPushInput,
} from '@nosion/contracts';
import { RateLimitGuard } from '../auth/guards/rate-limit.guard';
import { CurrentUser, RateLimit } from '../common/decorators';
import { zodBody, zodQuery } from '../common/zod-validation.pipe';
import { SyncService } from './sync.service';

/** Offline sync (สเปก 7.3 "Sync & Realtime" · 7.4 · Phase 7) */
@ApiTags('sync')
@Controller('sync')
@UseGuards(RateLimitGuard)
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  /** ส่ง outbox เป็นชุด (≤ 100) · ผลรายตัว — 200 เสมอแม้บางตัวล้ม (partial success) */
  @Post('push')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ limit: 60, windowSeconds: 60, by: 'user' })
  push(
    @CurrentUser('userId') userId: string,
    @Body(zodBody(syncPushSchema)) dto: SyncPushInput,
  ): Promise<SyncPushDto> {
    return this.sync.push(userId, dto);
  }

  @Get('pull')
  pull(
    @CurrentUser('userId') userId: string,
    @Query(zodQuery(syncPullSchema)) query: SyncPullQuery,
  ): Promise<SyncPullDto> {
    return this.sync.pull(userId, query);
  }
}
