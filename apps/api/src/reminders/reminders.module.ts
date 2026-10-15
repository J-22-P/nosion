import { Module } from '@nestjs/common';
import { RegistryModule } from '../core/registry/registry.module';
import { RemindersController } from './reminders.controller';
import { RemindersService } from './reminders.service';

/** Reminder Engine ฝั่ง API (สเปก 6.2) — จดเวลาเตือนลง DB · การยิงจริงอยู่ที่ apps/worker */
@Module({
  imports: [RegistryModule],
  controllers: [RemindersController],
  providers: [RemindersService],
  exports: [RemindersService],
})
export class RemindersModule {}
