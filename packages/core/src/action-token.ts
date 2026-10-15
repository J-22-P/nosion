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
/** purpose อยู่ในข้อมูลที่เซ็น — token ของงานหนึ่งเอาไปใช้กับอีกงานไม่ได้แม้ใช้ secret เดียวกัน */
const sign = (purpose: string, body: string, secret: string) =>
  createHmac('sha256', secret).update(`nosion-${purpose}:${body}`).digest();

/** token ทั่วไป: { u: userId, s: subject, x: หมดอายุ } */
function signToken(
  purpose: string,
  userId: string,
  subject: string,
  exp: number,
  secret: string,
): string {
  const body = b64url(Buffer.from(JSON.stringify({ u: userId, s: subject, x: exp })));
  return `${body}.${b64url(sign(purpose, body, secret))}`;
}

function verifyToken(
  purpose: string,
  token: string,
  secret: string,
  now: Date,
): { userId: string; subject: string; exp: number } | null {
  const [body, mac, extra] = token.split('.');
  if (!body || !mac || extra !== undefined) return null;
  const expected = sign(purpose, body, secret);
  const received = Buffer.from(mac, 'base64url');
  // เทียบแบบเวลาคงที่ — กันเดาลายเซ็นทีละไบต์จากเวลาตอบกลับ
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as {
      u?: unknown;
      s?: unknown;
      x?: unknown;
    };
    if (
      typeof parsed.u !== 'string' ||
      typeof parsed.s !== 'string' ||
      typeof parsed.x !== 'number'
    ) {
      return null;
    }
    if (parsed.x <= now.getTime()) return null;
    return { userId: parsed.u, subject: parsed.s, exp: parsed.x };
  } catch {
    return null;
  }
}

export function signActionToken(
  claims: Omit<ActionTokenClaims, 'exp'>,
  secret: string,
  now = new Date(),
): string {
  return signToken(
    'action',
    claims.userId,
    claims.entryId,
    now.getTime() + ACTION_TOKEN_TTL_MS,
    secret,
  );
}

/** คืน claims เมื่อลายเซ็นถูกและยังไม่หมดอายุ — อย่างอื่นคืน null (ไม่บอกว่าผิดเพราะอะไร) */
export function verifyActionToken(
  token: string,
  secret: string,
  now = new Date(),
): ActionTokenClaims | null {
  const claims = verifyToken('action', token, secret, now);
  return claims ? { userId: claims.userId, entryId: claims.subject, exp: claims.exp } : null;
}

// ── ลิงก์เลิกรับอีเมล (สเปก 10.3 "ทุกฉบับมีลิงก์ unsubscribe") ──

/** อีเมลแจ้งข่าวสารที่เลิกรับได้ — ตรงกับ flag ใน UserSettings */
export type EmailSubscriptionKind = 'digest' | 'weekly';

/** ลิงก์ในอีเมลเก่ายังควรใช้ได้นาน — คนเปิดอีเมลเดือนก่อนแล้วกดเลิกรับต้องได้ผล */
export const UNSUBSCRIBE_TOKEN_TTL_MS = 180 * 24 * 60 * 60 * 1000;

export function signUnsubscribeToken(
  claims: { userId: string; kind: EmailSubscriptionKind },
  secret: string,
  now = new Date(),
): string {
  return signToken(
    'unsubscribe',
    claims.userId,
    claims.kind,
    now.getTime() + UNSUBSCRIBE_TOKEN_TTL_MS,
    secret,
  );
}

export function verifyUnsubscribeToken(
  token: string,
  secret: string,
  now = new Date(),
): { userId: string; kind: EmailSubscriptionKind } | null {
  const claims = verifyToken('unsubscribe', token, secret, now);
  if (!claims || (claims.subject !== 'digest' && claims.subject !== 'weekly')) return null;
  return { userId: claims.userId, kind: claims.subject };
}
