import { MailDeliveryError, renderEmail, type MailTransport } from '@nosion/emails';
import type { PrismaClient, ReminderChannel } from '@prisma/client';
import {
  PermanentDeliveryError,
  type ReminderDispatcher,
  type ReminderMessage,
} from './dispatcher';

/**
 * ช่องทาง email ของการเตือน — template เดียวกับ API (@nosion/emails)
 * บัญชีทดลองไม่ส่งอีเมลจริง (สเปก 9.4) · ปลายทางปฏิเสธถาวร (4xx) ไม่ retry
 */
export class EmailDispatcher implements ReminderDispatcher {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly transport: MailTransport,
    private readonly appUrl: string,
  ) {}

  async send(_channel: ReminderChannel, message: ReminderMessage): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: message.userId },
      select: {
        email: true,
        isDemo: true,
        deletedAt: true,
        settings: { select: { locale: true } },
      },
    });
    if (!user || user.deletedAt) throw new PermanentDeliveryError('ไม่พบผู้ใช้');
    if (user.isDemo) throw new PermanentDeliveryError('บัญชีทดลองไม่ส่งอีเมลจริง');

    const mail = await renderEmail('reminder', {
      lang: user.settings?.locale === 'en' ? 'en' : 'th',
      title: message.title,
      body: message.body,
      openUrl: `${this.appUrl}${message.deepLink}`,
      settingsUrl: `${this.appUrl}/settings`,
    });
    try {
      await this.transport.send({ to: user.email, ...mail });
    } catch (err) {
      if (err instanceof MailDeliveryError && err.permanent) {
        throw new PermanentDeliveryError(err.message);
      }
      throw err;
    }
  }
}

/** ส่งต่อตามช่องทาง — ช่องทางที่ยังไม่มีตัวส่งจริงใช้ fallback (บันทึก log) */
export class ChannelRouter implements ReminderDispatcher {
  constructor(
    private readonly routes: Partial<Record<ReminderChannel, ReminderDispatcher>>,
    private readonly fallback: ReminderDispatcher,
  ) {}

  send(channel: ReminderChannel, message: ReminderMessage): Promise<void> {
    return (this.routes[channel] ?? this.fallback).send(channel, message);
  }
}
