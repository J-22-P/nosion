import { Module } from '@nestjs/common';
import { ExpenseTrackableModule } from './expense.trackable';

/**
 * โมดูลการเงิน — ไม่มีไฟล์ใน core/, entries/ หรือ registry ที่ต้องแก้
 * endpoint เฉพาะโมดูล (summary, forecast, budgets) จะเพิ่มในโฟลเดอร์นี้
 */
@Module({
  providers: [ExpenseTrackableModule],
  exports: [ExpenseTrackableModule],
})
export class ExpenseModule {}
