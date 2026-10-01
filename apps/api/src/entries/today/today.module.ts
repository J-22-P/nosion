import { Module } from '@nestjs/common';
import { UsersModule } from '../../users/users.module';
import { RegistryModule } from '../../core/registry/registry.module';
import { TodayController } from './today.controller';
import { TodayService } from './today.service';

@Module({
  imports: [RegistryModule, UsersModule],
  controllers: [TodayController],
  providers: [TodayService],
})
export class TodayModule {}
