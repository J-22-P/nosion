import { Module } from '@nestjs/common';
import { UsersModule } from '../../users/users.module';
import { BudgetsController } from './budgets.controller';
import { BudgetsService } from './budgets.service';
import { ExpenseStatsService } from './expense-stats.service';
import { ExpenseTrackableModule } from './expense.trackable';
import { ExpensesController } from './expenses.controller';

/**
 * โมดูลการเงิน — ไม่มีไฟล์ใน core/, entries/ หรือ registry ที่ต้องแก้
 * endpoint เฉพาะโมดูล (budgets, summary, forecast) อยู่ในโฟลเดอร์นี้
 */
@Module({
  imports: [UsersModule],
  controllers: [BudgetsController, ExpensesController],
  providers: [ExpenseTrackableModule, BudgetsService, ExpenseStatsService],
  exports: [ExpenseTrackableModule, ExpenseStatsService],
})
export class ExpenseModule {}
