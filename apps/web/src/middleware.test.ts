import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { middleware } from './middleware';

const KEY = 'k'.repeat(40);

/** header ที่ middleware ส่งต่อไปยังปลายทาง rewrite (Next ใส่ไว้ใน x-middleware-request-*) */
function forwarded(res: Response, name: string) {
  return res.headers.get(`x-middleware-request-${name}`);
}

describe('middleware (proxy /api/v1 → API)', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('แนบ IP ผู้ใช้ (ตัวแรกของ x-forwarded-for) + รหัสลับ · rewrite ไปที่ API คง path/query', () => {
    vi.stubEnv('API_PROXY_TARGET', 'https://api.example.com');
    vi.stubEnv('API_PROXY_KEY', KEY);
    const res = middleware(
      new NextRequest('https://web.example.com/api/v1/auth/demo?x=1', {
        method: 'POST',
        headers: { 'x-forwarded-for': '203.0.113.7, 76.76.21.1' },
      }),
    );
    expect(res.headers.get('x-middleware-rewrite')).toBe(
      'https://api.example.com/api/v1/auth/demo?x=1',
    );
    expect(forwarded(res, 'x-nosion-client-ip')).toBe('203.0.113.7');
    expect(forwarded(res, 'x-nosion-proxy-key')).toBe(KEY);
  });

  it('ผู้ใช้ส่ง header ปลอมมาเอง → ถูกเขียนทับ', () => {
    vi.stubEnv('API_PROXY_TARGET', 'https://api.example.com');
    vi.stubEnv('API_PROXY_KEY', KEY);
    const res = middleware(
      new NextRequest('https://web.example.com/api/v1/me', {
        headers: {
          'x-forwarded-for': '203.0.113.7',
          'x-nosion-client-ip': '1.1.1.1',
          'x-nosion-proxy-key': 'guess',
        },
      }),
    );
    expect(forwarded(res, 'x-nosion-client-ip')).toBe('203.0.113.7');
    expect(forwarded(res, 'x-nosion-proxy-key')).toBe(KEY);
  });

  it('ไม่ได้ตั้งค่า (local) → ปล่อยผ่าน ไม่ rewrite', () => {
    const res = middleware(new NextRequest('http://localhost:3000/api/v1/me'));
    expect(res.headers.get('x-middleware-rewrite')).toBeNull();
    expect(res.headers.get('x-middleware-next')).toBe('1');
  });
});
