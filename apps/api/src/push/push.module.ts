import { Module } from '@nestjs/common';
import { RateLimitGuard } from '../auth/guards/rate-limit.guard';
import { EntriesModule } from '../entries/entries.module';
import { PushController } from './push.controller';
import { PushService } from './push.service';

/** Web Push — เก็บ subscription + รับปุ่มจาก notification · การส่งจริงอยู่ที่ apps/worker */
@Module({
  imports: [EntriesModule],
  controllers: [PushController],
  providers: [PushService, RateLimitGuard],
})
export class PushModule {}
