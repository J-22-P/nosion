import { Module } from '@nestjs/common';
import { TaskTrackableModule } from './task.trackable';

/**
 * เพิ่มโมดูลใหม่ = สร้างโฟลเดอร์แบบนี้อีกชุดแล้ว import ใน AppModule
 * ไม่ต้องแตะ registry, entries, today, calendar หรือ parser เลย
 */
@Module({ providers: [TaskTrackableModule], exports: [TaskTrackableModule] })
export class TaskModule {}
