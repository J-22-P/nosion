import { verifyActionToken } from '@nosion/core';
import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import {
  PermanentDeliveryError,
  type ReminderDispatcher,
  type ReminderMessage,
} from './dispatcher';
import { WebPushDispatcher, type PushSender } from './web-push.dispatcher';

const SECRET = 's'.repeat(40);
const message: ReminderMessage = {
  userId: 'u1',
  entryId: 'e1',
  title: 'ค่าเน็ต ฿799.00',
  body: 'ครบกำหนดพรุ่งนี้',
  tag: 'entry-e1',
  deepLink: '/expenses',
  actions: [
    { action: 'complete', title: 'จ่ายแล้ว' },
    { action: 'defer', title: 'เลื่อน 1 วัน' },
  ],
};
const sub = (id: string) => ({
  id,
  userId: 'u1',
  endpoint: `https://push.example/${id}`,
  p256dh: 'p',
  auth: 'a',
});

function setup(
  subs: ReturnType<typeof sub>[],
  sender: PushSender,
  actionSecret: string | null = SECRET,
) {
  const deleted: string[] = [];
  const prisma = {
    pushSubscription: {
      findMany: vi.fn(async () => subs),
      deleteMany: vi.fn(async ({ where }: { where: { id: string } }) => {
        deleted.push(where.id);
        return { count: 1 };
      }),
    },
  } as unknown as PrismaClient;
  const fallback: ReminderDispatcher = { send: vi.fn(async () => undefined) };
  const dispatcher = new WebPushDispatcher(
    prisma,
    {
      publicKey: 'pub',
      privateKey: 'priv',
      subject: 'mailto:x@y.z',
      actionSecret: actionSecret ?? undefined,
    },
    fallback,
    sender,
  );
  return { dispatcher, deleted, fallback };
}

const httpError = (statusCode: number) =>
  Object.assign(new Error(`HTTP ${statusCode}`), { statusCode });

describe('WebPushDispatcher', () => {
  it('ส่งทุกเครื่อง · payload มีปุ่มและ action token ที่ตรวจผ่าน (ผูก user + entry)', async () => {
    const payloads: string[] = [];
    const { dispatcher } = setup([sub('a'), sub('b')], async (_t, p) => payloads.push(p));
    await dispatcher.send('push', message);
    expect(payloads).toHaveLength(2);
    const payload = JSON.parse(payloads[0]!);
    expect(payload).toMatchObject({
      title: 'ค่าเน็ต ฿799.00',
      tag: 'entry-e1',
      data: { deepLink: '/expenses' },
    });
    expect(payload.actions.map((a: { action: string }) => a.action)).toEqual(['complete', 'defer']);
    expect(verifyActionToken(payload.data.actionToken, SECRET)).toMatchObject({
      userId: 'u1',
      entryId: 'e1',
    });
  });

  it('ไม่ได้ตั้ง secret → ไม่มีปุ่ม (กดแล้วเปิดแอปแทน)', async () => {
    const payloads: string[] = [];
    const { dispatcher } = setup([sub('a')], async (_t, p) => payloads.push(p), null);
    await dispatcher.send('push', message);
    expect(JSON.parse(payloads[0]!)).toMatchObject({ actions: [], data: { actionToken: null } });
  });

  it('ไม่มีเครื่องลงทะเบียน → ล้มถาวร', async () => {
    const { dispatcher } = setup([], async () => undefined);
    await expect(dispatcher.send('push', message)).rejects.toBeInstanceOf(PermanentDeliveryError);
  });

  it('เครื่องที่ตอบ 410 ถูกลบ · อีกเครื่องสำเร็จ = สำเร็จ', async () => {
    const { dispatcher, deleted } = setup([sub('dead'), sub('ok')], async (t) => {
      if (t.endpoint.endsWith('dead')) throw httpError(410);
    });
    await dispatcher.send('push', message);
    expect(deleted).toEqual(['dead']);
  });

  it('ทุกเครื่อง 404/410 → ลบหมดและล้มถาวร', async () => {
    const { dispatcher, deleted } = setup([sub('a'), sub('b')], async (t) => {
      throw httpError(t.endpoint.endsWith('a') ? 404 : 410);
    });
    await expect(dispatcher.send('push', message)).rejects.toBeInstanceOf(PermanentDeliveryError);
    expect(deleted).toEqual(['a', 'b']);
  });

  it('push service ล่ม (5xx) → โยน error ธรรมดาให้ retry ไม่ลบ subscription', async () => {
    const { dispatcher, deleted } = setup([sub('a')], async () => {
      throw httpError(503);
    });
    const error = await dispatcher.send('push', message).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(PermanentDeliveryError);
    expect(deleted).toEqual([]);
  });

  it('ช่องทางอื่นส่งต่อให้ fallback', async () => {
    const { dispatcher, fallback } = setup([sub('a')], async () => undefined);
    await dispatcher.send('email', message);
    expect(fallback.send).toHaveBeenCalledWith('email', message);
  });
});
