import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Token ของปุ่มใน notification ("จ่ายแล้ว" / "เลื่อน 1 วัน") — สเปก 10.3
 *
 * service worker ไม่มี access token (เก็บใน memory ของหน้าเว็บเท่านั้น) จึงแนบ token นี้มากับ push:
 *  - worker เซ็น · API ตรวจ ด้วย secret เดียวกัน (NOTIFICATION_ACTION_SECRET)
 *  - ผูก user + entry และทำได้แค่ complete / defer — หลุดไปก็แตะได้รายการเดียว ทำได้สองอย่าง
 *  - หมดอายุ 7 วัน · payload ของ Web Push ถูกเข้ารหัสปลายทางถึงเบราว์เซอร์ (RFC 8291) อยู่แล้ว
 *
 * รูปแบบ: base64url(JSON) + "." + base64url(HMAC-SHA256)
 */
export interface ActionTokenClaims {
  userId: string;
  entryId: string;
  /** หมดอายุ (epoch ms) */
  exp: number;
}

export const ACTION_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const b64url = (buf: Buffer) => buf.toString('base64url');
const sign = (body: string, secret: string) =>
  createHmac('sha256', secret).update(`nosion-action:${body}`).digest();

export function signActionToken(
  claims: Omit<ActionTokenClaims, 'exp'>,
  secret: string,
  now = new Date(),
): string {
  const body = b64url(
    Buffer.from(
      JSON.stringify({
        u: claims.userId,
        e: claims.entryId,
        x: now.getTime() + ACTION_TOKEN_TTL_MS,
      }),
    ),
  );
  return `${body}.${b64url(sign(body, secret))}`;
}

/** คืน claims เมื่อลายเซ็นถูกและยังไม่หมดอายุ — อย่างอื่นคืน null (ไม่บอกว่าผิดเพราะอะไร) */
export function verifyActionToken(
  token: string,
  secret: string,
  now = new Date(),
): ActionTokenClaims | null {
  const [body, mac] = token.split('.');
  if (!body || !mac) return null;
  const expected = sign(body, secret);
  const received = Buffer.from(mac, 'base64url');
  // เทียบแบบเวลาคงที่ — กันเดาลายเซ็นทีละไบต์จากเวลาตอบกลับ
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as {
      u?: unknown;
      e?: unknown;
      x?: unknown;
    };
    if (
      typeof parsed.u !== 'string' ||
      typeof parsed.e !== 'string' ||
      typeof parsed.x !== 'number'
    ) {
      return null;
    }
    if (parsed.x <= now.getTime()) return null;
    return { userId: parsed.u, entryId: parsed.e, exp: parsed.x };
  } catch {
    return null;
  }
}
