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
  /**
   * ตั้งค่าผิด (SMTP_URL ใช้ไม่ได้ · ไม่มี RESEND_API_KEY) — ระบบยังขึ้นได้ แต่ send() จะล้มด้วยข้อความนี้
   * ผู้สร้าง transport ควร log ข้อความนี้ตอนเริ่มระบบ (ไม่มีค่าลับอยู่ในข้อความ)
   */
  readonly problem?: string;
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
 * ตรวจ SMTP_URL ก่อนส่งให้ nodemailer — ค่าที่ไม่ใช่ URL (เช่น วางรหัสผ่านแอปของ Gmail มาเปล่า ๆ)
 * ทำให้ nodemailer โยน error ที่มีค่าทั้งก้อน (รวมรหัสผ่าน) ตั้งแต่สร้าง transport → API ล่มทั้งตัวและรหัสหลุดลง log
 * คืนเหตุผลเป็นภาษาคน (ไม่มีค่าลับ) หรือ null ถ้าใช้ได้
 */
export function smtpUrlProblem(value: string | undefined): string | null {
  if (!value) return null; // ไม่ตั้ง = ใช้ Mailpit ในเครื่อง (smtp://localhost:1025)
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return 'ไม่ใช่ URL — ต้องเป็นแบบ smtps://ชื่อผู้ใช้:รหัสผ่าน@smtp.gmail.com:465';
  }
  if (url.protocol !== 'smtp:' && url.protocol !== 'smtps:') {
    return `ต้องขึ้นต้นด้วย smtp:// หรือ smtps:// (ได้ ${url.protocol}//)`;
  }
  if (!url.hostname) return 'ไม่มีชื่อเซิร์ฟเวอร์ (เช่น smtp.gmail.com)';
  if (url.username && !url.password) return 'มีชื่อผู้ใช้แต่ไม่มีรหัสผ่าน';
  if (/[\s]/.test(value.trim()) || /%20/.test(url.password)) {
    return 'มีช่องว่าง — รหัสผ่านแอปของ Gmail ต้องตัดช่องว่างออก';
  }
  if (url.username.includes('@')) return 'อีเมลในชื่อผู้ใช้ต้องเขียน @ เป็น %40';
  return null;
}

/**
 * SMTP_URL สำหรับ log — ปิดรหัสผ่าน · ค่าที่ไม่ใช่ URL ไม่แสดงเนื้อหาเลย (อาจเป็นรหัสผ่านทั้งก้อน)
 */
export function redactSmtpUrl(value: string | undefined): string {
  if (!value) return '(ไม่ได้ตั้ง)';
  try {
    const url = new URL(value.trim());
    if (url.password) url.password = '***';
    return url.toString();
  } catch {
    return `(ไม่ใช่ URL · ยาว ${value.length} ตัวอักษร)`;
  }
}

/** transport ที่ตั้งค่าผิด — ระบบยังทำงานต่อได้ ทุกครั้งที่ส่งล้มด้วยเหตุผลเดิม (ลองใหม่ก็ไม่ผ่าน) */
function misconfigured(driver: MailDriver, problem: string): MailTransport {
  return {
    driver,
    problem,
    async send() {
      throw new MailDeliveryError(problem, true);
    },
  };
}

/**
 * สลับผู้ให้บริการได้โดยไม่แตะโค้ดที่เรียกใช้:
 *  - log    — เทสต์ / CI (ไม่ต่อเครือข่าย)
 *  - smtp   — dev ส่งเข้า Mailpit (http://localhost:8025) ไม่ออกอินเทอร์เน็ตจริง (สเปก 10.3)
 *  - resend — staging / production ผ่าน HTTP API ตรง ๆ (ไม่ต้องลง SDK เพิ่ม)
 */
export function createMailTransport(config: MailConfig): MailTransport {
  if (config.driver === 'resend') {
    if (!config.resendApiKey) {
      return misconfigured('resend', 'MAIL_DRIVER=resend แต่ยังไม่ได้ตั้ง RESEND_API_KEY');
    }
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
    const problem = smtpUrlProblem(config.smtpUrl);
    if (problem) return misconfigured('smtp', `SMTP_URL ใช้ไม่ได้: ${problem}`);
    let transporter: ReturnType<typeof nodemailer.createTransport>;
    try {
      transporter = nodemailer.createTransport(config.smtpUrl?.trim() ?? 'smtp://localhost:1025');
    } catch {
      // ข้อความของ nodemailer อาจมีค่าทั้งก้อน — ไม่ส่งต่อ
      return misconfigured('smtp', 'SMTP_URL ใช้ไม่ได้: nodemailer อ่านค่านี้ไม่ได้');
    }
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
