import { z } from 'zod';

/** PushSubscription.toJSON() ของเบราว์เซอร์ (สเปก 10.3) */
export const pushSubscribeSchema = z.object({
  endpoint: z.string().url().max(2048),
  keys: z.object({
    p256dh: z.string().min(1).max(256),
    auth: z.string().min(1).max(128),
  }),
  userAgent: z.string().max(300).nullish(),
});
export type PushSubscribeInput = z.input<typeof pushSubscribeSchema>;

export const pushUnsubscribeSchema = z.object({ endpoint: z.string().url().max(2048) });

/** ปุ่มใน notification — service worker ส่ง token ที่มากับ push (ไม่มี access token) */
export const notificationActionSchema = z.object({
  token: z.string().min(1).max(1024),
  action: z.enum(['complete', 'defer']),
});
export type NotificationActionInput = z.infer<typeof notificationActionSchema>;

export interface PushConfigDto {
  /** VAPID public key (base64url) — null = เซิร์ฟเวอร์ยังไม่ได้ตั้งค่า push */
  publicKey: string | null;
}
