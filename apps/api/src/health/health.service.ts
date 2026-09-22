import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../infra/prisma/prisma.service';
import { RedisService } from '../infra/redis/redis.service';

export interface ReadinessResult {
  ready: boolean;
  checks: { database: boolean; redis: boolean };
  checkedAt: string;
}

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async checkDependencies(): Promise<ReadinessResult> {
    const [database, redis] = await Promise.all([this.checkDatabase(), this.redis.ping()]);
    return {
      // Redis ล่มยังให้บริการหลักได้ (rate limit fail-open) — DB ล่มคือไม่พร้อมจริง
      ready: database,
      checks: { database, redis },
      checkedAt: new Date().toISOString(),
    };
  }

  private async checkDatabase(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch (err) {
      this.logger.error(`ตรวจสุขภาพฐานข้อมูลไม่ผ่าน: ${(err as Error).message}`);
      return false;
    }
  }
}
