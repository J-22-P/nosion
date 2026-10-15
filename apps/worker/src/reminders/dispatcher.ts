import type { ReminderChannel } from '@prisma/client';
import { logger } from '../logger';

/** สิ่งที่ช่องทางไหนก็ส่งได้ — push ใช้ทุกช่อง, email/webhook ใช้บางส่วน */
export interface ReminderMessage {
  userId: string;
  entryId: string;
  title: string;
  body: string;
  /** notification ใหม่ทับตัวเก่าที่ tag เดียวกัน — ยิงซ้ำก็เห็นแค่อันเดียวบนเครื่อง (สเปก 10.3) */
  tag: string;
  deepLink: string;
  actions: { action: 'complete' | 'defer'; title: string }[];
}

export interface ReminderDispatcher {
  send(channel: ReminderChannel, message: ReminderMessage): Promise<void>;
}

/**
 * ส่งไม่ได้และลองใหม่ก็ไม่ได้ผล (ไม่มี subscription, ปลายทางตอบ 404/410, ไม่ได้ตั้ง webhook)
 * → processor ปิดเป็น failed ทันที ไม่เผา retry 5 รอบ
 */
export class PermanentDeliveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermanentDeliveryError';
  }
}

/** ช่องทางที่ยังไม่ได้ต่อของจริง — บันทึก log แทน (push: ขั้น 3 · email: ขั้น 4) */
export class LogDispatcher implements ReminderDispatcher {
  async send(channel: ReminderChannel, message: ReminderMessage): Promise<void> {
    logger.info({ channel, entryId: message.entryId, title: message.title }, 'reminder (log only)');
  }
}
