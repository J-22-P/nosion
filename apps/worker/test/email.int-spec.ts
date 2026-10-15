import { createMailTransport, renderEmail } from '@nosion/emails';
import { describe, expect, it } from 'vitest';

/**
 * ส่งจริงผ่าน SMTP เข้า Mailpit แล้วอ่านกลับจาก HTTP API ของมัน (สเปก 10.3 "ทดสอบด้วย Mailpit")
 * จับปัญหาที่ unit test มองไม่เห็น: encoding ภาษาไทยในหัวเรื่อง, multipart html+text, header ที่ไปถึงปลายทางจริง
 */
const SMTP_URL = process.env.SMTP_URL ?? 'smtp://localhost:1025';
const MAILPIT_API = process.env.MAILPIT_API_URL ?? 'http://localhost:8025';

interface MailpitSummary {
  ID: string;
  Subject: string;
  To: { Address: string }[];
}

describe('อีเมลผ่าน SMTP → Mailpit', () => {
  it('หัวเรื่องภาษาไทย + html + text + List-Unsubscribe ไปถึงปลายทางครบ', async () => {
    const to = `digest-${crypto.randomUUID()}@test.local`;
    const unsubscribe = 'http://localhost:3001/api/v1/email/unsubscribe?token=t';
    const mail = await renderEmail('dailyDigest', {
      name: 'Jay',
      dateLabel: 'วันพฤหัสบดีที่ 15 ตุลาคม',
      overdue: [],
      today: [{ title: 'ส่งรายงาน' }],
      bills: [{ title: 'ค่าเน็ต', detail: '฿799.00' }],
      appUrl: 'http://localhost:3000/today',
      settingsUrl: 'http://localhost:3000/settings',
      unsubscribeUrl: unsubscribe,
    });
    const transport = createMailTransport({
      driver: 'smtp',
      from: 'NOSION <noreply@nosion.dev>',
      smtpUrl: SMTP_URL,
    });
    await transport.send({
      to,
      ...mail,
      headers: {
        'List-Unsubscribe': `<${unsubscribe}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    });

    let found: MailpitSummary | undefined;
    for (let i = 0; i < 40 && !found; i += 1) {
      const res = await fetch(
        `${MAILPIT_API}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`,
      );
      found = ((await res.json()) as { messages: MailpitSummary[] }).messages[0];
      if (!found) await new Promise((r) => setTimeout(r, 100));
    }
    expect(found?.Subject).toBe('วันนี้มี 2 เรื่องรอคุณ · NOSION');

    const message = (await (await fetch(`${MAILPIT_API}/api/v1/message/${found!.ID}`)).json()) as {
      HTML: string;
      Text: string;
    };
    expect(message.HTML).toContain('ค่าเน็ต');
    expect(message.Text).toContain('บิลใกล้ครบกำหนด (1)');
    const headers = (await (
      await fetch(`${MAILPIT_API}/api/v1/message/${found!.ID}/headers`)
    ).json()) as Record<string, string[]>;
    expect(headers['List-Unsubscribe-Post']).toEqual(['List-Unsubscribe=One-Click']);
  });
});
