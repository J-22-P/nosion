import { MailDeliveryError, type MailTransport, type OutgoingMail } from '@nosion/emails';
import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import {
  PermanentDeliveryError,
  type ReminderDispatcher,
  type ReminderMessage,
} from './dispatcher';
import { ChannelRouter, EmailDispatcher } from './email.dispatcher';

const message: ReminderMessage = {
  userId: 'u1',
  entryId: 'e1',
  title: 'ค่าเน็ต ฿799.00',
  body: 'ครบกำหนดพรุ่งนี้',
  tag: 'entry-e1',
  deepLink: '/expenses',
  actions: [],
};

function setup(
  user: { email: string; isDemo: boolean; deletedAt: Date | null } | null,
  fail?: Error,
) {
  const sent: OutgoingMail[] = [];
  const prisma = { user: { findUnique: vi.fn(async () => user) } } as unknown as PrismaClient;
  const transport: MailTransport = {
    driver: 'smtp',
    send: async (mail) => {
      if (fail) throw fail;
      sent.push(mail);
    },
  };
  return { dispatcher: new EmailDispatcher(prisma, transport, 'https://app.nosion.dev'), sent };
}

describe('EmailDispatcher', () => {
  it('ส่งถึงอีเมลของผู้ใช้ · หัวเรื่อง = ชื่อ + กำหนด · ปุ่มพาไปหน้าของโมดูล', async () => {
    const { dispatcher, sent } = setup({
      email: 'jay@example.com',
      isDemo: false,
      deletedAt: null,
    });
    await dispatcher.send('email', message);
    expect(sent[0]).toMatchObject({
      to: 'jay@example.com',
      subject: 'ค่าเน็ต ฿799.00 — ครบกำหนดพรุ่งนี้',
    });
    expect(sent[0]!.html).toContain('href="https://app.nosion.dev/expenses"');
  });

  it('บัญชีทดลอง / ผู้ใช้ถูกลบ → ล้มถาวร ไม่ส่ง', async () => {
    for (const user of [
      { email: 'demo@x', isDemo: true, deletedAt: null },
      { email: 'gone@x', isDemo: false, deletedAt: new Date() },
      null,
    ]) {
      const { dispatcher, sent } = setup(user);
      await expect(dispatcher.send('email', message)).rejects.toBeInstanceOf(
        PermanentDeliveryError,
      );
      expect(sent).toHaveLength(0);
    }
  });

  it('ผู้ให้บริการปฏิเสธถาวร → PermanentDeliveryError · ล่มชั่วคราว → error ธรรมดาให้ retry', async () => {
    const user = { email: 'jay@example.com', isDemo: false, deletedAt: null };
    await expect(
      setup(user, new MailDeliveryError('422', true)).dispatcher.send('email', message),
    ).rejects.toBeInstanceOf(PermanentDeliveryError);
    const transient = await setup(user, new MailDeliveryError('503', false))
      .dispatcher.send('email', message)
      .catch((e: unknown) => e);
    expect(transient).not.toBeInstanceOf(PermanentDeliveryError);
  });
});

describe('ChannelRouter', () => {
  it('ส่งตามช่องทาง · ไม่มีตัวส่งใช้ fallback', async () => {
    const push: ReminderDispatcher = { send: vi.fn(async () => undefined) };
    const fallback: ReminderDispatcher = { send: vi.fn(async () => undefined) };
    const router = new ChannelRouter({ push }, fallback);
    await router.send('push', message);
    await router.send('webhook', message);
    expect(push.send).toHaveBeenCalledTimes(1);
    expect(fallback.send).toHaveBeenCalledWith('webhook', message);
  });
});
