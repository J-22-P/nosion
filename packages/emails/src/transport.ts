import nodemailer from 'nodemailer';

export interface OutgoingMail {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** เช่น List-Unsubscribe ของอีเมลแจ้งข่าวสาร (RFC 8058) */
  headers?: Record<string, string>;
}

export interface MailTransport {
  readonly driver: MailDriver;
  send(mail: OutgoingMail): Promise<void>;
}

export type MailDriver = 'log' | 'smtp' | 'resend';

/**
 * ส่งไม่สำเร็จ — `permanent` = ลองใหม่ก็ไม่ผ่าน (อีเมลปลายทางผิด, ถูกปฏิเสธ 4xx)
 * ผู้เรียก (worker) ใช้ตัดสินว่าจะ retry หรือปิดเป็น failed
 */
export class MailDeliveryError extends Error {
  constructor(
    message: string,
    readonly permanent: boolean,
  ) {
    super(message);
    this.name = 'MailDeliveryError';
  }
}

export interface MailConfig {
  driver: MailDriver;
  from: string;
  smtpUrl?: string;
  resendApiKey?: string;
  /** แทน fetch ในเทสต์ */
  fetchImpl?: typeof fetch;
  /** ใช้กับ driver=log */
  log?: (mail: OutgoingMail) => void;
}

/**
 * สลับผู้ให้บริการได้โดยไม่แตะโค้ดที่เรียกใช้:
 *  - log    — เทสต์ / CI (ไม่ต่อเครือข่าย)
 *  - smtp   — dev ส่งเข้า Mailpit (http://localhost:8025) ไม่ออกอินเทอร์เน็ตจริง (สเปก 10.3)
 *  - resend — staging / production ผ่าน HTTP API ตรง ๆ (ไม่ต้องลง SDK เพิ่ม)
 */
export function createMailTransport(config: MailConfig): MailTransport {
  if (config.driver === 'resend') {
    if (!config.resendApiKey) throw new Error('MAIL_DRIVER=resend ต้องตั้ง RESEND_API_KEY');
    const doFetch = config.fetchImpl ?? fetch;
    return {
      driver: 'resend',
      async send(mail) {
        const res = await doFetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${config.resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ from: config.from, ...mail }),
        });
        if (!res.ok) {
          const detail = (await res.text()).slice(0, 300);
          // 429 / 5xx = ชั่วคราว · 4xx อื่น (อีเมลผิด, โดเมนยังไม่ยืนยัน) = ลองใหม่ก็ไม่ผ่าน
          const permanent = res.status >= 400 && res.status < 500 && res.status !== 429;
          throw new MailDeliveryError(`Resend ตอบ ${res.status}: ${detail}`, permanent);
        }
      },
    };
  }

  if (config.driver === 'smtp') {
    const transporter = nodemailer.createTransport(config.smtpUrl ?? 'smtp://localhost:1025');
    return {
      driver: 'smtp',
      async send(mail) {
        await transporter.sendMail({ from: config.from, ...mail });
      },
    };
  }

  return {
    driver: 'log',
    async send(mail) {
      config.log?.(mail);
    },
  };
}
