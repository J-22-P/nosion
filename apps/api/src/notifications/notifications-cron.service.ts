import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  ChannelRouter,
  EmailDispatcher,
  LogDispatcher,
  WebPushDispatcher,
  configureNotifyLogger,
  runDailyDigest,
  runDueReminders,
  type ReminderDispatcher,
} from '@nosion/notifications';
import { APP_CONFIG, type AppConfig } from '../infra/config/env';
import { MailService } from '../infra/mail/mail.service';
import { PrismaService } from '../infra/prisma/prisma.service';

/**
 * ส่งการเตือน + สรุปรายวันจาก API เอง — ใช้บน Vercel ระหว่างที่ยังไม่มี worker (Phase 4 ขั้น 8)
 * ตรรกะทั้งหมดอยู่ใน @nosion/notifications ตัวเดียวกับ worker: guard, ช่วงห้ามรบกวน, ข้อความ, Web Push, อีเมล
 * ที่นี่แค่ประกอบ dispatcher จาก env ของ API
 */
@Injectable()
export class NotificationsCronService {
  private readonly logger = new Logger('Notifications');
  private readonly dispatcher: ReminderDispatcher;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {
    const log = (level: 'log' | 'warn' | 'error') => (obj: object | string, msg?: string) =>
      this.logger[level](typeof obj === 'string' ? obj : `${msg ?? ''} ${JSON.stringify(obj)}`);
    configureNotifyLogger({ info: log('log'), warn: log('warn'), error: log('error') });

    const fallback = new LogDispatcher();
    const routes: ConstructorParameters<typeof ChannelRouter>[0] = {};
    if (config.VAPID_PUBLIC_KEY && config.VAPID_PRIVATE_KEY) {
      routes.push = new WebPushDispatcher(
        prisma,
        {
          publicKey: config.VAPID_PUBLIC_KEY,
          privateKey: config.VAPID_PRIVATE_KEY,
          subject: config.VAPID_SUBJECT,
          actionSecret: config.NOTIFICATION_ACTION_SECRET,
        },
        fallback,
      );
    }
    if (mail.transport.driver !== 'log') {
      routes.email = new EmailDispatcher(prisma, mail.transport, config.APP_URL);
    }
    this.dispatcher = new ChannelRouter(routes, fallback);
  }

  reminders(now = new Date()) {
    return runDueReminders(this.prisma, this.dispatcher, now);
  }

  digest(now = new Date()) {
    return runDailyDigest(
      {
        prisma: this.prisma,
        transport: this.mail.transport,
        appUrl: this.config.APP_URL,
        apiUrl: this.config.API_URL,
        unsubscribeSecret: this.config.NOTIFICATION_ACTION_SECRET,
      },
      now,
    );
  }
}
