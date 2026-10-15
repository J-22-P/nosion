import { Module } from '@nestjs/common';
import { RateLimitGuard } from '../auth/guards/rate-limit.guard';
import { EmailPreferencesService } from './email-preferences.service';
import { UnsubscribeController } from './unsubscribe.controller';

@Module({
  controllers: [UnsubscribeController],
  providers: [EmailPreferencesService, RateLimitGuard],
})
export class EmailModule {}
