import { Module } from '@nestjs/common';
import { UsersModule } from '../../users/users.module';
import { TaskStatsService } from './task-stats.service';
import { TaskTrackableModule } from './task.trackable';
import { TasksController } from './tasks.controller';

/**
 * เพิ่มโมดูลใหม่ = สร้างโฟลเดอร์แบบนี้อีกชุดแล้ว import ใน AppModule
 * ไม่ต้องแตะ registry, entries, today, calendar หรือ parser เลย
 * endpoint เฉพาะโมดูล (sidebar, focus timer) อยู่ในโฟลเดอร์นี้ด้วย
 */
@Module({
  imports: [UsersModule],
  controllers: [TasksController],
  providers: [TaskTrackableModule, TaskStatsService],
  exports: [TaskTrackableModule],
})
export class TaskModule {}
