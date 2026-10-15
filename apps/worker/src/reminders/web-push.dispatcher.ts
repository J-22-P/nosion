import { signActionToken } from '@nosion/core';
import type { PrismaClient, ReminderChannel } from '@prisma/client';
import webpush from 'web-push';
import { logger } from '../logger';
import {
  PermanentDeliveryError,
  type ReminderDispatcher,
  type ReminderMessage,
} from './dispatcher';

export interface PushTarget {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/** ส่ง 1 subscription — แยกออกมาให้เทสต์แทนได้โดยไม่ต้องยิง push service จริง */
export type PushSender = (target: PushTarget, payload: string) => Promise<unknown>;

export interface WebPushConfig {
  publicKey: string;
  privateKey: string;
  subject: string;
  /** ไม่ตั้ง = notification ไม่มีปุ่ม "จ่ายแล้ว / เลื่อน" (กดแล้วเปิดแอปแทน) */
  actionSecret?: string;
}

/** push service บอกว่า subscription นี้ตายแล้ว — ลบทิ้ง ไม่ต้อง retry (สเปก 6.2) */
const GONE = new Set([404, 410]);

/** payload ต้องเล็กกว่า 4KB (สเปก 10.3) — ข้อความเราไม่กี่ร้อยไบต์ แต่ตรวจไว้กันชื่อรายการยาวผิดปกติ */
const MAX_PAYLOAD_BYTES = 3_500;

export function buildPushPayload(message: ReminderMessage, actionToken: string | null): string {
  const payload = {
    title: message.title,
    body: message.body,
    tag: message.tag,
    icon: '/icons/icon-192.png',
    data: { deepLink: message.deepLink, entryId: message.entryId, actionToken },
    actions: actionToken ? message.actions : [],
  };
  const json = JSON.stringify(payload);
  if (Buffer.byteLength(json) <= MAX_PAYLOAD_BYTES) return json;
  return JSON.stringify({
    ...payload,
    title: payload.title.slice(0, 80),
    body: payload.body.slice(0, 200),
  });
}

/**
 * ช่องทาง push: ส่งทุกเครื่องของผู้ใช้
 *  - ไม่มีเครื่องลงทะเบียนเลย → ล้มถาวร (retry ไปก็ไม่มีที่ส่ง)
 *  - เครื่องไหนตอบ 404/410 → ลบ subscription นั้นทิ้ง
 *  - สำเร็จอย่างน้อย 1 เครื่อง = สำเร็จ · ล้มทุกเครื่องด้วยสาเหตุอื่น (5xx, network) → โยนให้ BullMQ retry
 */
export class WebPushDispatcher implements ReminderDispatcher {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly config: WebPushConfig,
    private readonly fallback: ReminderDispatcher,
    private readonly sender: PushSender = (target, payload) =>
      webpush.sendNotification(target, payload, {
        vapidDetails: {
          subject: config.subject,
          publicKey: config.publicKey,
          privateKey: config.privateKey,
        },
        TTL: 24 * 3600,
        urgency: 'high',
      }),
  ) {}

  async send(channel: ReminderChannel, message: ReminderMessage): Promise<void> {
    if (channel !== 'push') return this.fallback.send(channel, message);

    const subscriptions = await this.prisma.pushSubscription.findMany({
      where: { userId: message.userId },
    });
    if (!subscriptions.length)
      throw new PermanentDeliveryError('ผู้ใช้ยังไม่ได้เปิดการแจ้งเตือนบนเครื่องใดเลย');

    const token = this.config.actionSecret
      ? signActionToken(
          { userId: message.userId, entryId: message.entryId },
          this.config.actionSecret,
        )
      : null;
    const payload = buildPushPayload(message, token);

    let delivered = 0;
    let gone = 0;
    const errors: string[] = [];
    for (const sub of subscriptions) {
      try {
        await this.sender(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
        );
        delivered += 1;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status && GONE.has(status)) {
          gone += 1;
          await this.prisma.pushSubscription.deleteMany({ where: { id: sub.id } });
          logger.info({ subscriptionId: sub.id, status }, 'ลบ push subscription ที่หมดอายุ');
        } else {
          errors.push(status ? `HTTP ${status}` : (err as Error).message);
        }
      }
    }

    if (delivered > 0) return;
    if (gone === subscriptions.length) {
      throw new PermanentDeliveryError('push subscription ทุกเครื่องหมดอายุแล้ว');
    }
    throw new Error(`ส่ง push ไม่สำเร็จ: ${errors.join(', ')}`);
  }
}
