import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../infra/redis/redis.service';

/**
 * access token อายุ 15 นาที จึงมีช่องว่างระหว่าง "กดออกจากระบบ" กับ "token หมดอายุเอง"
 * เก็บ sid ที่ถูกเพิกถอนไว้ใน Redis ตลอดอายุที่เหลือของ token เพื่อปิดช่องนั้น
 * ตรวจที่ Redis แทน DB เพราะทำทุก request — ต้องเร็วระดับไมโครวินาที
 */
@Injectable()
export class SessionRevocationService {
  private readonly logger = new Logger(SessionRevocationService.name);

  constructor(private readonly redis: RedisService) {}

  private key(sessionId: string): string {
    return `revoked:session:${sessionId}`;
  }

  async revoke(sessionId: string, ttlSeconds: number): Promise<void> {
    try {
      await this.redis.client.set(this.key(sessionId), '1', 'EX', Math.max(ttlSeconds, 1));
    } catch (err) {
      // Redis ล่ม → session ยังถูกเพิกถอนใน DB อยู่ดี แค่ token ใบปัจจุบันอาจใช้ได้จนหมดอายุ
      this.logger.warn(`บันทึกการเพิกถอน session ลง Redis ไม่ได้: ${(err as Error).message}`);
    }
  }

  async revokeMany(sessionIds: string[], ttlSeconds: number): Promise<void> {
    await Promise.all(sessionIds.map((id) => this.revoke(id, ttlSeconds)));
  }

  async isRevoked(sessionId: string): Promise<boolean> {
    try {
      return (await this.redis.client.exists(this.key(sessionId))) === 1;
    } catch {
      return false; // fail-open: DB ยังเป็นแหล่งความจริงสุดท้ายตอน refresh
    }
  }
}
