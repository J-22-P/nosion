import { describe, expect, it, vi } from 'vitest';
import { MailDeliveryError, createMailTransport, redactSmtpUrl, smtpUrlProblem } from './transport';

const GMAIL_APP_PASSWORD = 'abcd efgh ijkl mnop';
const GOOD = 'smtps://someone%40gmail.com:abcdefghijklmnop@smtp.gmail.com:465';
const mail = { to: 'a@b.co', subject: 's', html: '<p>x</p>', text: 'x' };

describe('smtpUrlProblem', () => {
  it('URL ที่ถูกต้อง / ไม่ตั้ง (ใช้ Mailpit) ผ่าน', () => {
    expect(smtpUrlProblem(GOOD)).toBeNull();
    expect(smtpUrlProblem('smtp://localhost:1025')).toBeNull();
    expect(smtpUrlProblem(undefined)).toBeNull();
  });

  it('บอกเหตุผลที่อ่านเข้าใจ — และไม่มีค่าที่ตั้งอยู่ในข้อความ', () => {
    const cases: Array<[string, RegExp]> = [
      [GMAIL_APP_PASSWORD, /ไม่ใช่ URL/],
      ['https://smtp.gmail.com', /smtp:\/\/ หรือ smtps:\/\//],
      ['smtps://someone%40gmail.com@smtp.gmail.com:465', /ไม่มีรหัสผ่าน/],
      ['smtps://someone%40gmail.com:abcd%20efgh@smtp.gmail.com:465', /ช่องว่าง/],
    ];
    for (const [value, reason] of cases) {
      const problem = smtpUrlProblem(value);
      expect(problem).toMatch(reason);
      expect(problem).not.toContain('abcd');
    }
  });
});

describe('redactSmtpUrl', () => {
  it('ปิดรหัสผ่าน · ค่าที่ไม่ใช่ URL ไม่แสดงเนื้อหาเลย', () => {
    expect(redactSmtpUrl(GOOD)).toBe('smtps://someone%40gmail.com:***@smtp.gmail.com:465');
    expect(redactSmtpUrl(GMAIL_APP_PASSWORD)).toBe('(ไม่ใช่ URL · ยาว 19 ตัวอักษร)');
    expect(redactSmtpUrl(undefined)).toBe('(ไม่ได้ตั้ง)');
  });
});

describe('createMailTransport ตั้งค่าผิด', () => {
  it('SMTP_URL เป็นรหัสผ่านเปล่า ๆ → ไม่ล้มตอนสร้าง · ส่งแล้วล้มแบบถาวรด้วยเหตุผล ไม่มีรหัสผ่าน', async () => {
    const transport = createMailTransport({
      driver: 'smtp',
      from: 'x',
      smtpUrl: GMAIL_APP_PASSWORD,
    });
    expect(transport.problem).toMatch(/^SMTP_URL ใช้ไม่ได้: ไม่ใช่ URL/);
    const error = await transport.send(mail).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MailDeliveryError);
    expect((error as MailDeliveryError).permanent).toBe(true);
    expect((error as Error).message).not.toContain('abcd');
  });

  it('resend ไม่มี key → ไม่ล้มตอนสร้าง · ไม่เรียก API', async () => {
    const fetchImpl = vi.fn();
    const transport = createMailTransport({ driver: 'resend', from: 'x', fetchImpl });
    expect(transport.problem).toMatch(/RESEND_API_KEY/);
    await expect(transport.send(mail)).rejects.toBeInstanceOf(MailDeliveryError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('SMTP_URL ถูกต้อง → ไม่มี problem', () => {
    expect(
      createMailTransport({ driver: 'smtp', from: 'x', smtpUrl: GOOD }).problem,
    ).toBeUndefined();
  });
});
