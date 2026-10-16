import { describe, expect, it } from 'vitest';
import { base64UrlToBytes, pushStateOf, serviceWorkerUrl, type PushEnvironment } from './push';

const ready: PushEnvironment = {
  hasServiceWorker: true,
  hasPushManager: true,
  hasNotification: true,
  isIOS: false,
  isStandalone: false,
  permission: 'default',
  serverEnabled: true,
  subscribed: false,
};

describe('pushStateOf', () => {
  it.each<[string, Partial<PushEnvironment>, string]>([
    ['เบราว์เซอร์ปกติ ยังไม่เปิด', {}, 'off'],
    ['อนุญาตแล้วและ subscribe แล้ว', { permission: 'granted', subscribed: true }, 'on'],
    [
      'subscribe ค้างแต่ผู้ใช้ถอนสิทธิ์ภายหลัง',
      { permission: 'denied', subscribed: true },
      'denied',
    ],
    ['เซิร์ฟเวอร์ยังไม่ตั้ง VAPID', { serverEnabled: false }, 'server-disabled'],
    [
      'iPhone ใน Safari (ยังไม่ติดตั้งลงหน้าจอโฮม)',
      { isIOS: true, hasPushManager: false, hasNotification: false },
      'ios-needs-install',
    ],
    [
      'iPhone ติดตั้งแล้วแต่ iOS เก่า',
      { isIOS: true, isStandalone: true, hasPushManager: false },
      'unsupported',
    ],
    ['เบราว์เซอร์ไม่มี service worker', { hasServiceWorker: false }, 'unsupported'],
  ])('%s → %s', (_name, patch, expected) => {
    expect(pushStateOf({ ...ready, ...patch })).toBe(expected);
  });
});

describe('base64UrlToBytes', () => {
  it('ถอด base64url (ไม่มี padding, ใช้ - _) ได้ไบต์เดิม', () => {
    const bytes = new Uint8Array([0xfb, 0xff, 0xfe, 0x00, 0x01]);
    const encoded = btoa(String.fromCharCode(...bytes))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    expect([...base64UrlToBytes(encoded)]).toEqual([...bytes]);
  });
});

describe('serviceWorkerUrl', () => {
  it('local: บอก API คนละพอร์ต · staging (proxy): ไม่ส่ง = origin เดียวกัน', () => {
    expect(serviceWorkerUrl('http://localhost:3001', false)).toBe(
      '/sw.js?api=http%3A%2F%2Flocalhost%3A3001',
    );
    expect(serviceWorkerUrl('', false)).toBe('/sw.js');
  });

  it('build จริงเปิดแคชออฟไลน์ (cache=1) · dev ไม่เปิด', () => {
    expect(serviceWorkerUrl('', true)).toBe('/sw.js?cache=1');
    expect(serviceWorkerUrl('http://localhost:3001', true)).toBe(
      '/sw.js?api=http%3A%2F%2Flocalhost%3A3001&cache=1',
    );
  });
});
