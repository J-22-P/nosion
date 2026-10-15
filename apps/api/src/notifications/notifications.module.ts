import { Module } from '@nestjs/common';
import { NotificationsCronController } from './notifications-cron.controller';
import { NotificationsCronService } from './notifications-cron.service';

@Module({ controllers: [NotificationsCronController], providers: [NotificationsCronService] })
export class NotificationsModule {}
