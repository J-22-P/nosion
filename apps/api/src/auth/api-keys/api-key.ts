import type { ApiKeyScope } from '@nosion/contracts';
import { createHash, randomBytes } from 'node:crypto';

/**
 * รูปแบบ API key: `nos_` + 32 ไบต์สุ่ม (base64url) — คำนำหน้าทำให้
 *  • guard แยกออกจาก JWT ได้ทันทีโดยไม่ต้องลอง verify
 *  • เครื่องมือสแกน secret (Gitleaks · GitHub secret scanning) จับได้เมื่อหลุดเข้า git
 */
export const API_KEY_PREFIX = 'nos_';
/** ส่วนต้นที่เก็บไว้แสดงในหน้าตั้งค่า (`nos_` + 8 ตัว) — สั้นพอจะไม่ช่วยเดา key */
const DISPLAY_PREFIX_LENGTH = API_KEY_PREFIX.length + 8;

export function isApiKey(token: string): boolean {
  return token.startsWith(API_KEY_PREFIX);
}

export function generateApiKey(): { key: string; hash: string; prefix: string } {
  const key = API_KEY_PREFIX + randomBytes(32).toString('base64url');
  return { key, hash: hashApiKey(key), prefix: key.slice(0, DISPLAY_PREFIX_LENGTH) };
}

/**
 * เก็บแค่ sha256 — key สุ่ม 256 บิตไม่ต้องใช้ hash ช้าแบบรหัสผ่าน (เดาไม่ได้อยู่แล้ว)
 * และต้องหาจาก hash ได้ตรง ๆ ทุกคำขอ (unique index) ซึ่ง Argon2 ที่ใส่ salt ทำไม่ได้
 */
export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

/** method ไหนต้องใช้สิทธิ์อะไร — อ่านอย่างเดียว = read · ที่เหลือเปลี่ยนข้อมูล = write */
export function requiredScope(method: string): ApiKeyScope {
  return ['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase()) ? 'read' : 'write';
}

/** อ่าน key จาก `Authorization: Bearer nos_…` หรือ `X-API-Key: nos_…` */
export function extractApiKey(headers: {
  authorization?: string | undefined;
  apiKey?: string | undefined;
}): string | null {
  const bearer = headers.authorization?.startsWith('Bearer ')
    ? headers.authorization.slice(7).trim()
    : null;
  if (bearer && isApiKey(bearer)) return bearer;
  const header = headers.apiKey?.trim();
  return header && isApiKey(header) ? header : null;
}
