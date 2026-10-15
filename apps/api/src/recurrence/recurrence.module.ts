import { Module } from '@nestjs/common';
import { RateLimitGuard } from '../auth/guards/rate-limit.guard';
import { UsersModule } from '../users/users.module';
import { RegistryModule } from '../core/registry/registry.module';
import { RemindersModule } from '../reminders/reminders.module';
import { RecurrenceCronController } from './recurrence-cron.controller';
import { RecurrenceController } from './recurrence.controller';
import { RecurrenceService } from './recurrence.service';

/** Recurrence Engine (สเปก 6.1) — ส่วนคำนวณล้วนอยู่ที่ @nosion/core · ที่นี่คือชั้น persistence (ADR-006 ห้าม Prisma ใน core/) */
@Module({
  imports: [RegistryModule, UsersModule, RemindersModule],
  controllers: [RecurrenceController, RecurrenceCronController],
  providers: [RecurrenceService, RateLimitGuard],
  exports: [RecurrenceService],
})
export class RecurrenceModule {}
