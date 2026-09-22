import { Injectable, Logger } from '@nestjs/common';
import { Algorithm, hash, verify } from '@node-rs/argon2';
import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Argon2id ตามคำแนะนำปัจจุบันของ OWASP (ADR-004)
 * bcrypt จำกัด input 72 bytes และต้าน GPU/ASIC ได้แย่กว่า
 */
const ARGON2_OPTIONS = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19_456, // KiB
  timeCost: 2,
  parallelism: 1,
} as const;

/**
 * hash ของรหัสผ่านสมมติ ใช้เผาเวลาให้เท่ากันตอนไม่พบผู้ใช้
 * → response time ของ "อีเมลไม่มีในระบบ" เท่ากับ "รหัสผ่านผิด" (กัน user enumeration)
 */
const DUMMY_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHRzb21lc2FsdA$Zm9vYmFyYmF6cXV4Zm9vYmFyYmF6cXV4MDAwMDA';

@Injectable()
export class PasswordService {
  private readonly logger = new Logger(PasswordService.name);

  async hash(plain: string): Promise<string> {
    return hash(plain, ARGON2_OPTIONS);
  }

  async verify(hashed: string | null, plain: string): Promise<boolean> {
    try {
      return await verify(hashed ?? DUMMY_HASH, plain, ARGON2_OPTIONS);
    } catch {
      return false;
    }
  }

  /** เผาเวลาให้เท่ากับการ verify จริง — เรียกเมื่อไม่พบผู้ใช้ */
  async burnTime(plain: string): Promise<void> {
    await this.verify(DUMMY_HASH, plain);
  }

  /**
   * ตรวจว่ารหัสผ่านเคยรั่วไหลหรือไม่ ด้วย k-anonymity ของ HIBP
   * ส่งไปแค่ prefix 5 ตัวของ SHA-1 — รหัสผ่านจริงไม่เคยออกจากเซิร์ฟเวอร์
   * ล้มเหลว = ผ่าน (fail-open) เพราะเป็นบริการภายนอกที่เราคุมไม่ได้
   */
  async isPwned(plain: string, fetchImpl: typeof fetch = fetch): Promise<boolean> {
    const sha1 = createHash('sha1').update(plain).digest('hex').toUpperCase();
    const prefix = sha1.slice(0, 5);
    const suffix = sha1.slice(5);
    try {
      const res = await fetchImpl(`https://api.pwnedpasswords.com/range/${prefix}`, {
        signal: AbortSignal.timeout(2_000),
      });
      if (!res.ok) return false;
      const body = await res.text();
      return body
        .split('\n')
        .some((line) => line.split(':')[0]?.trim().toUpperCase() === suffix);
    } catch (err) {
      this.logger.warn(`ตรวจ HIBP ไม่สำเร็จ ปล่อยผ่าน: ${(err as Error).message}`);
      return false;
    }
  }

  /** เทียบ secret แบบ timing-safe เสมอ */
  static safeEqual(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  }
}
