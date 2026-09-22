import { Inject, Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { APP_CONFIG, type AppConfig } from '../config/env';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  readonly client: Redis;
  private healthy = false;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.client = new Redis(config.REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 2,
      enableOfflineQueue: false,
      retryStrategy: (times) => Math.min(times * 200, 5_000),
    });
    this.client.on('ready', () => {
      this.healthy = true;
      this.logger.log('เชื่อมต่อ Redis แล้ว');
    });
    this.client.on('error', (err: Error) => {
      if (this.healthy) this.logger.warn(`Redis ขัดข้อง: ${err.message}`);
      this.healthy = false;
    });
    void this.client.connect().catch((err: Error) => {
      this.logger.warn(`เชื่อมต่อ Redis ไม่ได้ตอนเริ่มระบบ: ${err.message}`);
    });
  }

  isHealthy(): boolean {
    return this.healthy;
  }

  async ping(): Promise<boolean> {
    try {
      return (await this.client.ping()) === 'PONG';
    } catch {
      return false;
    }
  }

  /**
   * นับจำนวนครั้งในหน้าต่างเวลาแบบ fixed window
   * คืน null เมื่อ Redis ล่ม → ผู้เรียกตัดสินใจเองว่าจะ fail-open หรือ fail-closed
   */
  async incrementWindow(key: string, windowSeconds: number): Promise<number | null> {
    try {
      const [count] = (await this.client
        .multi()
        .incr(key)
        .expire(key, windowSeconds, 'NX')
        .exec()) as [[Error | null, number], ...unknown[]];
      return count?.[1] ?? null;
    } catch {
      return null;
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.client.disconnect();
  }
}
