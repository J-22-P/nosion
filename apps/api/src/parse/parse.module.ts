import { Module } from '@nestjs/common';
import { RateLimitGuard } from '../auth/guards/rate-limit.guard';
import { ParserService } from '../core/parser/parser.service';
import { RegistryModule } from '../core/registry/registry.module';
import { EntriesModule } from '../entries/entries.module';
import { OrganizationModule } from '../organization/organization.module';
import { RecurrenceModule } from '../recurrence/recurrence.module';
import { UsersModule } from '../users/users.module';
import { ParseController } from './parse.controller';
import { ParseService } from './parse.service';

/** NL Parser ข้ามโมดูล (สเปก 6.4) — ตัวตีความอยู่ใน core/parser · ที่นี่คือ endpoint + การบันทึก */
@Module({
  imports: [RegistryModule, UsersModule, EntriesModule, RecurrenceModule, OrganizationModule],
  controllers: [ParseController],
  providers: [ParseService, ParserService, RateLimitGuard],
  exports: [ParseService],
})
export class ParseModule {}
