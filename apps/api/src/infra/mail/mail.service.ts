import { Inject, Injectable, Logger } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config/env';

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/**
 * Phase 0–1: dev เขียนอีเมลลง log (และ mailpit ใน docker) — ยังไม่ผูก Resend
 * ตัว adapter ถูกแยกไว้แล้วเพื่อให้สลับ provider ได้โดยไม่แตะโค้ดเรียกใช้
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  async send(message: MailMessage): Promise<void> {
    this.logger.log(`[mail] → ${message.to} : ${message.subject}`);
    if (this.config.NODE_ENV !== 'production') {
      this.logger.debug(`[mail] body: ${message.text ?? message.html.slice(0, 200)}`);
    }
    await Promise.resolve();
  }

  async sendVerifyEmail(to: string, token: string): Promise<void> {
    const link = `${this.config.APP_URL}/verify-email?token=${token}`;
    await this.send({
      to,
      subject: 'ยืนยันอีเมลของคุณ · NOSION',
      html: `<p>กดลิงก์เพื่อยืนยันอีเมล: <a href="${link}">${link}</a></p>`,
      text: `ยืนยันอีเมล: ${link}`,
    });
  }

  async sendPasswordReset(to: string, token: string): Promise<void> {
    const link = `${this.config.APP_URL}/reset-password?token=${token}`;
    await this.send({
      to,
      subject: 'ตั้งรหัสผ่านใหม่ · NOSION',
      html: `<p>ลิงก์นี้ใช้ได้ 15 นาที: <a href="${link}">${link}</a></p>`,
      text: `ตั้งรหัสผ่านใหม่ (15 นาที): ${link}`,
    });
  }

  /** แจ้งเตือนเมื่อตรวจพบการใช้ refresh token ซ้ำ (สเปกหัวข้อ 9.2) */
  async sendSuspiciousActivity(to: string): Promise<void> {
    await this.send({
      to,
      subject: 'ตรวจพบการใช้งานที่น่าสงสัย · NOSION',
      html: '<p>เราพบการใช้ token เดิมซ้ำ จึงออกจากระบบทุกอุปกรณ์เพื่อความปลอดภัย</p>',
      text: 'เราพบการใช้ token เดิมซ้ำ จึงออกจากระบบทุกอุปกรณ์เพื่อความปลอดภัย',
    });
  }
}
