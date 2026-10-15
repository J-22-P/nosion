import { Module } from '@nestjs/common';
import { RegistryModule } from '../core/registry/registry.module';
import { RecurrenceModule } from '../recurrence/recurrence.module';
import { UsersModule } from '../users/users.module';
import { CalendarController } from './calendar.controller';
import { CalendarService } from './calendar.service';

/** Calendar Aggregator (สเปก 6.3) — การแปลงเป็น event อยู่ในแต่ละโมดูล ที่นี่แค่ดึงและรวม */
@Module({
  imports: [RegistryModule, UsersModule, RecurrenceModule],
  controllers: [CalendarController],
  providers: [CalendarService],
})
export class CalendarModule {}
