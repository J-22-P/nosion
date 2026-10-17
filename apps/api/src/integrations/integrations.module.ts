import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { AuthModule } from '../auth/auth.module';
import { EntriesModule } from '../entries/entries.module';
import {
  GitHubController,
  GitHubCronController,
  GitHubWebhookController,
} from './github/github.controller';
import { GitHubService } from './github/github.service';

/** เชื่อมกับระบบภายนอก (Phase 8 ขั้น 5) — ตอนนี้มี GitHub */
@Module({
  imports: [AuthModule, EntriesModule, UsersModule],
  controllers: [GitHubController, GitHubWebhookController, GitHubCronController],
  providers: [GitHubService],
})
export class IntegrationsModule {}
