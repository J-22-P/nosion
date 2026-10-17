import {
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
  type RawBodyRequest,
} from '@nestjs/common';
import { ApiExcludeController, ApiTags } from '@nestjs/swagger';
import type {
  GitHubIntegrationDto,
  GitHubSyncResultDto,
  GitHubWebhookSecretDto,
} from '@nosion/contracts';
import type { Request } from 'express';
import { RateLimitGuard } from '../../auth/guards/rate-limit.guard';
import { CurrentUser, Public, RateLimit } from '../../common/decorators';
import { APP_CONFIG, type AppConfig } from '../../infra/config/env';
import { matches } from '../../recurrence/recurrence-cron.controller';
import { GitHubService } from './github.service';

/** ตั้งค่าการเชื่อม GitHub จากหน้าตั้งค่า (Phase 8 ขั้น 5) */
@ApiTags('integrations')
@Controller('integrations/github')
@UseGuards(RateLimitGuard)
export class GitHubController {
  constructor(private readonly github: GitHubService) {}

  @Get()
  status(@CurrentUser('userId') userId: string): Promise<GitHubIntegrationDto> {
    return this.github.status(userId);
  }

  /** ดึง issue/PR ที่ได้รับมอบหมายตอนนี้ (นอกจาก cron รายชั่วโมง) */
  @Post('sync')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ limit: 10, windowSeconds: 600, by: 'user' })
  sync(@CurrentUser('userId') userId: string): Promise<GitHubSyncResultDto> {
    return this.github.sync(userId);
  }

  /** สร้าง/หมุน secret ของ webhook — แสดงครั้งเดียว */
  @Post('webhook')
  @RateLimit({ limit: 10, windowSeconds: 3600, by: 'user' })
  rotateWebhook(@CurrentUser('userId') userId: string): Promise<GitHubWebhookSecretDto> {
    return this.github.rotateWebhookSecret(userId);
  }

  @Delete('webhook')
  @HttpCode(HttpStatus.NO_CONTENT)
  async disableWebhook(@CurrentUser('userId') userId: string): Promise<void> {
    await this.github.disableWebhook(userId);
  }
}

/**
 * ปลายทางที่ GitHub ส่ง event มา — ไม่มี access token · ยืนยันด้วยลายเซ็น HMAC ของ body ดิบ
 * (ต้องสร้างแอปด้วย `rawBody: true` — main.ts · serverless.ts)
 */
@ApiExcludeController()
@Controller('webhooks/github')
@UseGuards(RateLimitGuard)
export class GitHubWebhookController {
  constructor(private readonly github: GitHubService) {}

  @Public()
  @Post(':id')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ limit: 300, windowSeconds: 60 })
  receive(
    @Param('id') id: string,
    @Headers('x-github-event') event: string | undefined,
    @Headers('x-hub-signature-256') signature: string | undefined,
    @Req() req: RawBodyRequest<Request>,
  ): Promise<{ handled: string }> {
    return this.github.handleWebhook(id, event, signature, req.rawBody);
  }
}

/** cron รายชั่วโมง (cron-job.org · `Authorization: Bearer $CRON_SECRET`) — ดึงให้ผู้ใช้ที่เชื่อม GitHub ไว้ */
@ApiExcludeController()
@Controller('internal/cron')
export class GitHubCronController {
  constructor(
    private readonly github: GitHubService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Public()
  @Get('github')
  run(@Headers('authorization') authorization: string | undefined) {
    const secret = this.config.CRON_SECRET;
    if (!secret) throw new NotFoundException();
    if (!matches(authorization ?? '', `Bearer ${secret}`)) throw new UnauthorizedException();
    return this.github.syncDue();
  }
}
