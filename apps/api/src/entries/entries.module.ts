import { Module } from '@nestjs/common';
import { RegistryModule } from '../core/registry/registry.module';
import { RecurrenceModule } from '../recurrence/recurrence.module';
import { UsersModule } from '../users/users.module';
import { EntriesController } from './entries.controller';
import { EntriesService } from './entries.service';

@Module({
  imports: [RegistryModule, UsersModule, RecurrenceModule],
  controllers: [EntriesController],
  providers: [EntriesService],
  exports: [EntriesService],
})
export class EntriesModule {}
