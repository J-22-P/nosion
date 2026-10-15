import type { PushConfigDto, PushSubscribeInput } from '@nosion/contracts';
import { API_URL, apiFetch } from '@/lib/api-client';

/** สถานะ push ของ "เครื่องนี้" — subscription เป็นของเบราว์เซอร์ ไม่ใช่ของบัญชี */
export type PushState =
  | 'unsupported'
  /** iPhone/iPad: Safari รับ push ได้เฉพาะเมื่อเพิ่มลงหน้าจอโฮมแล้ว (iOS 16.4+) */
  | 'ios-needs-install'
  | 'server-disabled'
  | 'denied'
  | 'off'
  | 'on';

export interface PushEnvironment {
  hasServiceWorker: boolean;
  hasPushManager: boolean;
  hasNotification: boolean;
  isIOS: boolean;
  isStandalone: boolean;
  permission: NotificationPermission | null;
  serverEnabled: boolean;
  subscribed: boolean;
}

/** ฟังก์ชันล้วน — แยกจาก API ของเบราว์เซอร์เพื่อทดสอบทุกกรณีได้ */
export function pushStateOf(env: PushEnvironment): PushState {
  if (!env.hasServiceWorker || !env.hasPushManager || !env.hasNotification) {
    return env.isIOS && !env.isStandalone ? 'ios-needs-install' : 'unsupported';
  }
  if (!env.serverEnabled) return 'server-disabled';
  if (env.permission === 'denied') return 'denied';
  return env.subscribed && env.permission === 'granted' ? 'on' : 'off';
}

/** VAPID public key (base64url) → bytes ที่ pushManager.subscribe() ต้องการ */
export function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = (value + '='.repeat((4 - (value.length % 4)) % 4))
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const raw = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/** บอก service worker ว่า API อยู่ที่ไหน (local = คนละพอร์ต · staging = origin เดียวกันผ่าน proxy) */
export function serviceWorkerUrl(apiUrl = API_URL): string {
  return apiUrl ? `/sw.js?api=${encodeURIComponent(apiUrl)}` : '/sw.js';
}

export const pushApi = {
  config: () => apiFetch<PushConfigDto>('/push/config'),
  subscribe: (input: PushSubscribeInput) =>
    apiFetch<void>('/push/subscribe', { method: 'POST', body: input }),
  unsubscribe: (endpoint: string) =>
    apiFetch<void>('/push/unsubscribe', { method: 'DELETE', body: { endpoint } }),
};

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  return navigator.serviceWorker.register(serviceWorkerUrl());
}

export async function detectPushEnvironment(serverEnabled: boolean): Promise<PushEnvironment> {
  const hasServiceWorker = 'serviceWorker' in navigator;
  const hasPushManager = 'PushManager' in window;
  const hasNotification = 'Notification' in window;
  let subscribed = false;
  if (hasServiceWorker && hasPushManager) {
    const registration = await navigator.serviceWorker.getRegistration();
    subscribed = Boolean(await registration?.pushManager.getSubscription());
  }
  return {
    hasServiceWorker,
    hasPushManager,
    hasNotification,
    isIOS: /iPad|iPhone|iPod/.test(navigator.userAgent),
    isStandalone:
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true,
    permission: hasNotification ? Notification.permission : null,
    serverEnabled,
    subscribed,
  };
}

/** ขออนุญาต → subscribe กับ push service ของเบราว์เซอร์ → ส่ง subscription ให้ API */
export async function enablePush(publicKey: string): Promise<void> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('ไม่ได้รับอนุญาตให้แจ้งเตือน');
  const registration = (await registerServiceWorker()) ?? (await navigator.serviceWorker.ready);
  await navigator.serviceWorker.ready;
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToBytes(publicKey),
    }));
  const json = subscription.toJSON();
  await pushApi.subscribe({
    endpoint: subscription.endpoint,
    keys: { p256dh: json.keys?.p256dh ?? '', auth: json.keys?.auth ?? '' },
    userAgent: navigator.userAgent.slice(0, 300),
  });
}

/** ลบที่ API ก่อน แล้วค่อยยกเลิกกับเบราว์เซอร์ — ถ้าลบที่ API ไม่สำเร็จ ยังกดใหม่ได้ */
export async function disablePush(): Promise<void> {
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;
  await pushApi.unsubscribe(subscription.endpoint);
  await subscription.unsubscribe();
}
