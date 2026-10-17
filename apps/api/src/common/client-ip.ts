import { timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export const CLIENT_IP_HEADER = 'x-nosion-client-ip';
export const PROXY_KEY_HEADER = 'x-nosion-proxy-key';

/** IPv4 / IPv6 แบบหยาบ ๆ — กันค่าแปลก (ยาว/มีอักขระพิเศษ) ไปเป็น key ของ Redis */
const IP_LIKE = /^[0-9a-fA-F:.]{2,45}$/;

function sameKey(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * IP จริงของผู้ใช้เมื่อคำขอมาผ่าน proxy `/api/v1` ของเว็บ (Vercel rewrite)
 *
 * ปัญหา: API เห็นทุกคำขอที่ผ่าน proxy มาจาก IP ของ Vercel ตัวเดียวกัน → rate limit ต่อ IP กลายเป็นโควตารวมทั้งโลก
 * (demo login 5 ครั้ง/ชม. "ของทุกคน" · กันเดารหัสผ่านไม่ได้ผล) — เจอจริงตอน smoke ของ CI ได้ 429 (Phase 8 ขั้น 2)
 *
 * middleware ของเว็บแนบ IP ผู้ใช้ + รหัสลับร่วม · ที่นี่เชื่อ IP นั้น **เฉพาะเมื่อรหัสลับตรง** แล้วแทน `req.ip`
 * → rate limit, session, log ที่อ่าน `req.ip` อยู่แล้วได้ค่าถูกโดยไม่ต้องแก้ · ไม่ตรง = ลบ header ทิ้ง (ปลอมไม่ได้)
 */
export function trustProxiedClientIp(proxyKey: string | undefined) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const forwarded = req.header(CLIENT_IP_HEADER)?.trim();
    const key = req.header(PROXY_KEY_HEADER);
    if (proxyKey && key && forwarded && IP_LIKE.test(forwarded) && sameKey(key, proxyKey)) {
      Object.defineProperty(req, 'ip', { value: forwarded, configurable: true });
    }
    delete req.headers[CLIENT_IP_HEADER];
    delete req.headers[PROXY_KEY_HEADER];
    next();
  };
}
