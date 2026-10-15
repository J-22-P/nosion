import { describe, expect, it, vi } from 'vitest';
import { renderEmail } from './render';
import { MailDeliveryError, createMailTransport } from './transport';

const settingsUrl = 'https://app.nosion.dev/settings';
const unsubscribeUrl = 'https://api.nosion.dev/api/v1/email/unsubscribe?token=abc';

describe('renderEmail — ครบ 7 แบบ', () => {
  it('ยืนยันอีเมล: ลิงก์อยู่ในปุ่ม · ไม่มี unsubscribe (อีเมลธุรกรรม)', async () => {
    const mail = await renderEmail('verifyEmail', {
      link: 'https://app.nosion.dev/verify-email?token=t1',
      settingsUrl,
    });
    expect(mail.subject).toBe('ยืนยันอีเมลของคุณ · NOSION');
    expect(mail.html).toContain('href="https://app.nosion.dev/verify-email?token=t1"');
    expect(mail.html).toMatch(/<html[^>]*lang="th"/);
    expect(mail.html).not.toContain('เลิกรับอีเมล');
    expect(mail.text).toContain('https://app.nosion.dev/verify-email?token=t1');
  });

  it('รีเซ็ตรหัสผ่าน: บอกอายุลิงก์', async () => {
    const mail = await renderEmail('resetPassword', {
      link: 'https://x/reset?token=t',
      expiresMinutes: 15,
      settingsUrl,
    });
    expect(mail.text).toContain('15 นาที');
  });

  it('แจ้งเตือนความปลอดภัย', async () => {
    const mail = await renderEmail('securityAlert', {
      reason: 'ตรวจพบการใช้ token เดิมซ้ำ',
      when: '15 ต.ค. 2569 14:20',
      settingsUrl,
    });
    expect(mail.subject).toContain('น่าสงสัย');
    expect(mail.text).toContain('ตรวจพบการใช้ token เดิมซ้ำ');
  });

  it('สรุปรายวัน: หัวเรื่องนับรวม · กลุ่มที่ว่างไม่แสดง · มี unsubscribe', async () => {
    const mail = await renderEmail('dailyDigest', {
      name: 'Jay',
      dateLabel: 'วันพฤหัสบดีที่ 15 ตุลาคม',
      overdue: [{ title: 'ส่งรายงาน', detail: 'เลยมา 2 วัน' }],
      today: [],
      bills: [{ title: 'ค่าเน็ต', detail: '฿799.00' }],
      appUrl: 'https://app.nosion.dev/today',
      settingsUrl,
      unsubscribeUrl,
    });
    expect(mail.subject).toBe('วันนี้มี 2 เรื่องรอคุณ · NOSION');
    expect(mail.text).toContain('เลยกำหนด (1)');
    expect(mail.text).not.toContain('วันนี้ (0)');
    expect(mail.html).toContain(`href="${unsubscribeUrl.replace(/&/g, '&amp;')}"`);
  });

  it('สรุปรายวันที่ไม่มีอะไรเลย → หัวเรื่องบอกว่าว่าง', async () => {
    const mail = await renderEmail('dailyDigest', {
      name: 'Jay',
      dateLabel: 'x',
      overdue: [],
      today: [],
      bills: [],
      appUrl: 'https://a',
      settingsUrl,
      unsubscribeUrl,
    });
    expect(mail.subject).toContain('วันนี้ว่าง');
  });

  it('สรุปสัปดาห์ · งบเกิน/ใกล้เต็ม · การเตือน', async () => {
    const weekly = await renderEmail('weeklyReview', {
      name: 'Jay',
      rangeLabel: '6–12 ต.ค.',
      completed: 12,
      created: 15,
      spent: '฿4,320',
      appUrl: 'https://a',
      settingsUrl,
      unsubscribeUrl,
    });
    expect(weekly.subject).toBe('สรุปสัปดาห์ 6–12 ต.ค. · NOSION');

    const base = {
      name: 'Jay',
      category: 'อาหาร',
      spent: '฿5,200',
      budget: '฿5,000',
      appUrl: 'https://a',
      settingsUrl,
      unsubscribeUrl,
    };
    expect((await renderEmail('budgetAlert', { ...base, percent: 104 })).subject).toBe(
      'งบอาหารเกินแล้ว (104%) · NOSION',
    );
    expect((await renderEmail('budgetAlert', { ...base, percent: 80 })).subject).toBe(
      'งบอาหารใช้ไป 80% แล้ว · NOSION',
    );

    const reminder = await renderEmail('reminder', {
      title: 'ค่าเน็ต ฿799.00',
      body: 'ครบกำหนดพรุ่งนี้',
      openUrl: 'https://app.nosion.dev/expenses',
      settingsUrl,
    });
    expect(reminder.subject).toBe('ค่าเน็ต ฿799.00 — ครบกำหนดพรุ่งนี้');
  });

  it('ข้อความจากผู้ใช้ถูก escape — ชื่อรายการมี HTML ไม่กลายเป็นแท็ก', async () => {
    const mail = await renderEmail('reminder', {
      title: '<img src=x onerror=alert(1)>',
      body: 'ครบกำหนดวันนี้',
      openUrl: 'https://a',
      settingsUrl,
    });
    expect(mail.html).not.toContain('<img src=x');
    expect(mail.html).toContain('&lt;img src=x');
  });
});

describe('createMailTransport · resend', () => {
  const mail = { to: 'jay@example.com', subject: 's', html: '<p>h</p>', text: 't' };

  it('POST ไป Resend พร้อม API key และ from', async () => {
    const fetchImpl = vi.fn(async () => new Response('{"id":"1"}', { status: 200 }));
    const transport = createMailTransport({
      driver: 'resend',
      from: 'NOSION <noreply@nosion.dev>',
      resendApiKey: 're_test',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await transport.send({ ...mail, headers: { 'List-Unsubscribe': '<https://u>' } });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer re_test');
    expect(JSON.parse(init.body as string)).toMatchObject({
      from: 'NOSION <noreply@nosion.dev>',
      to: 'jay@example.com',
      headers: { 'List-Unsubscribe': '<https://u>' },
    });
  });

  it.each([
    [422, true],
    [403, true],
    [429, false],
    [500, false],
  ])('ตอบ %i → permanent=%s', async (status, permanent) => {
    const transport = createMailTransport({
      driver: 'resend',
      from: 'x',
      resendApiKey: 're_test',
      fetchImpl: (async () => new Response('nope', { status })) as unknown as typeof fetch,
    });
    const error = await transport.send(mail).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MailDeliveryError);
    expect((error as MailDeliveryError).permanent).toBe(permanent);
  });

  it('driver=resend แต่ไม่มี key → ล้มตั้งแต่สร้าง (ไม่ไปล้มตอนส่งฉบับแรก)', () => {
    expect(() => createMailTransport({ driver: 'resend', from: 'x' })).toThrow('RESEND_API_KEY');
  });
});
