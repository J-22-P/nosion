import { Module } from '@nestjs/common';
import { UsersModule } from '../../users/users.module';
import { RegistryModule } from '../../core/registry/registry.module';
import { ReviewController } from '../review/review.controller';
import { ReviewService } from '../review/review.service';
import { TodayController } from './today.controller';
import { TodayService } from './today.service';

@Module({
  imports: [RegistryModule, UsersModule],
  // สรุปรายสัปดาห์ (Phase 6) ใช้ dependency ชุดเดียวกับ Today — registry + user context + Prisma
  controllers: [TodayController, ReviewController],
  providers: [TodayService, ReviewService],
})
export class TodayModule {}
