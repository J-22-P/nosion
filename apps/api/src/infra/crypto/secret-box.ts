import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * เข้ารหัสค่าลับที่ต้องอ่านกลับได้ (token ของผู้ให้บริการ OAuth · คุกกี้ state) — AES-256-GCM (สเปก 9.3)
 * GCM ให้ทั้งความลับและการตรวจว่าถูกแก้ (auth tag) — ค่าที่ถูกแก้แม้บิตเดียวถอดไม่ได้ คืน null
 *
 * รูปแบบ: `v1.<iv>.<tag>.<ciphertext>` (base64url) — มีเลขรุ่นไว้เผื่อหมุนกุญแจ/เปลี่ยนอัลกอริทึม
 * `aad` ผูกค่ากับบริบท (เช่น "oauth-state") — ค่าที่เข้ารหัสไว้ใช้ที่หนึ่ง เอาไปใช้อีกที่ไม่ได้
 */
export class SecretBox {
  private readonly key: Buffer;

  constructor(hexKey: string) {
    if (!/^[0-9a-f]{64}$/i.test(hexKey)) throw new Error('ENCRYPTION_KEY ต้องเป็น hex 64 ตัว');
    this.key = Buffer.from(hexKey, 'hex');
  }

  seal(plain: string, aad: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(Buffer.from(aad));
    const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return ['v1', iv, cipher.getAuthTag(), body].map(encode).join('.');
  }

  open(sealed: string, aad: string): string | null {
    const [version, iv, tag, body] = sealed.split('.');
    if (version !== 'v1' || !iv || !tag || body === undefined) return null;
    try {
      const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64url'));
      decipher.setAAD(Buffer.from(aad));
      decipher.setAuthTag(Buffer.from(tag, 'base64url'));
      return Buffer.concat([
        decipher.update(Buffer.from(body, 'base64url')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      return null;
    }
  }
}

function encode(part: string | Buffer): string {
  return typeof part === 'string' ? part : part.toString('base64url');
}
