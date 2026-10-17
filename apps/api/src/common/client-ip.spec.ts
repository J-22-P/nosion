import type { Request } from 'express';
import { describe, expect, it } from 'vitest';
import { CLIENT_IP_HEADER, PROXY_KEY_HEADER, trustProxiedClientIp } from './client-ip';

const KEY = 'k'.repeat(40);

function run(headers: Record<string, string>, proxyKey: string | null = KEY) {
  const all: Record<string, string | undefined> = { ...headers };
  const req = {
    ip: '76.76.21.1', // IP ของ proxy (Vercel)
    headers: all,
    header: (name: string) => all[name],
  } as unknown as Request;
  let called = false;
  trustProxiedClientIp(proxyKey ?? undefined)(req, {} as never, () => (called = true));
  return { req, called };
}

describe('trustProxiedClientIp', () => {
  it('รหัสลับตรง → req.ip = IP ผู้ใช้ที่ proxy ส่งมา · header ถูกลบ', () => {
    const { req, called } = run({ [CLIENT_IP_HEADER]: '203.0.113.7', [PROXY_KEY_HEADER]: KEY });
    expect(called).toBe(true);
    expect(req.ip).toBe('203.0.113.7');
    expect(req.headers[CLIENT_IP_HEADER]).toBeUndefined();
    expect(req.headers[PROXY_KEY_HEADER]).toBeUndefined();
  });

  it('รหัสลับผิด / ไม่มี / ยังไม่ได้ตั้งที่ API → ไม่เชื่อ (ผู้ใช้ปลอม IP ไม่ได้)', () => {
    expect(run({ [CLIENT_IP_HEADER]: '1.2.3.4', [PROXY_KEY_HEADER]: 'x'.repeat(40) }).req.ip).toBe(
      '76.76.21.1',
    );
    expect(run({ [CLIENT_IP_HEADER]: '1.2.3.4' }).req.ip).toBe('76.76.21.1');
    expect(run({ [CLIENT_IP_HEADER]: '1.2.3.4', [PROXY_KEY_HEADER]: KEY }, null).req.ip).toBe(
      '76.76.21.1',
    );
  });

  it('ค่าที่ไม่ใช่ IP ไม่ถูกใช้เป็น key ของ rate limit', () => {
    const { req } = run({ [CLIENT_IP_HEADER]: 'rl:*; DROP', [PROXY_KEY_HEADER]: KEY });
    expect(req.ip).toBe('76.76.21.1');
  });

  it('IPv6 ใช้ได้', () => {
    const { req } = run({ [CLIENT_IP_HEADER]: '2001:db8::1', [PROXY_KEY_HEADER]: KEY });
    expect(req.ip).toBe('2001:db8::1');
  });
});
