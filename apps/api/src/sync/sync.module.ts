import { Module } from '@nestjs/common';
import { RateLimitGuard } from '../auth/guards/rate-limit.guard';
import { EntriesModule } from '../entries/entries.module';
import { ParseModule } from '../parse/parse.module';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';

/** Offline sync — ทุก operation ผ่าน EntriesService / ParseService ตัวเดียวกับ endpoint ปกติ */
@Module({
  imports: [EntriesModule, ParseModule],
  controllers: [SyncController],
  providers: [SyncService, RateLimitGuard],
})
export class SyncModule {}
