import { Module } from '@nestjs/common';
import { UsersModule } from '../../users/users.module';
import { HabitTrackableModule } from './habit.trackable';
import { HabitsController } from './habits.controller';
import { HabitsService } from './habits.service';

/**
 * โมดูลนิสัย (Phase 6) — เพิ่มโมดูลที่สามโดยไม่แตะ core/, entries/, calendar/, parse/
 * AppModule เพิ่ม import บรรทัดเดียว
 */
@Module({
  imports: [UsersModule],
  controllers: [HabitsController],
  providers: [HabitTrackableModule, HabitsService],
  exports: [HabitTrackableModule],
})
export class HabitModule {}
