import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  createMailTransport,
  renderEmail,
  type EmailKind,
  type EmailPropsByKind,
  type MailTransport,
} from '@nosion/emails';
import { APP_CONFIG, type AppConfig } from '../config/env';

/**
 * อีเมลฝั่ง API (สเปก 10.3) — template จาก @nosion/emails ชุดเดียวกับ worker
 * ผู้ให้บริการเลือกด้วย MAIL_DRIVER: log (เทสต์) · smtp (Mailpit) · resend (staging/production)
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transport: MailTransport;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {
    this.transport = createMailTransport({
      driver: config.MAIL_DRIVER,
      from: config.EMAIL_FROM,
      smtpUrl: config.SMTP_URL,
      resendApiKey: config.RESEND_API_KEY,
      log: (mail) => this.logger.log(`[mail:log] → ${mail.to} : ${mail.subject}`),
    });
  }

  private get settingsUrl(): string {
    return `${this.config.APP_URL}/settings`;
  }

  async send<K extends EmailKind>(
    to: string,
    kind: K,
    props: Omit<EmailPropsByKind[K], 'settingsUrl'>,
  ): Promise<void> {
    const mail = await renderEmail(kind, {
      ...props,
      settingsUrl: this.settingsUrl,
    } as EmailPropsByKind[K]);
    await this.transport.send({ to, ...mail });
  }

  async sendVerifyEmail(to: string, token: string): Promise<void> {
    await this.send(to, 'verifyEmail', {
      link: `${this.config.APP_URL}/verify-email?token=${token}`,
    });
  }

  async sendPasswordReset(to: string, token: string): Promise<void> {
    await this.send(to, 'resetPassword', {
      link: `${this.config.APP_URL}/reset-password?token=${token}`,
      expiresMinutes: 15,
    });
  }

  /** ตรวจพบการใช้ refresh token ซ้ำ (สเปกหัวข้อ 9.2) — ส่งไม่สำเร็จไม่ควรทำให้การเพิกถอน session ล้ม */
  async sendSuspiciousActivity(to: string, timeZone = 'Asia/Bangkok'): Promise<void> {
    const when = new Intl.DateTimeFormat('th-TH', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone,
    }).format(new Date());
    try {
      await this.send(to, 'securityAlert', { reason: 'ตรวจพบการใช้ token เดิมซ้ำ', when });
    } catch (err) {
      this.logger.error(`ส่งอีเมลแจ้งเตือนความปลอดภัยไม่สำเร็จ: ${(err as Error).message}`);
    }
  }
}
