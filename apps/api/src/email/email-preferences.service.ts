import { Injectable } from '@nestjs/common';
import type { EmailSubscriptionKind } from '@nosion/core';
import { PrismaService } from '../infra/prisma/prisma.service';

/** เปิด/ปิดอีเมลแจ้งข่าวสารตาม flag ใน UserSettings */
@Injectable()
export class EmailPreferencesService {
  constructor(private readonly prisma: PrismaService) {}

  /** ซ้ำได้ — ปิดแล้วปิดอีกก็ผลเดิม */
  async unsubscribe(userId: string, kind: EmailSubscriptionKind): Promise<void> {
    await this.prisma.userSettings.updateMany({
      where: { userId },
      data: kind === 'digest' ? { dailyDigestEnabled: false } : { weeklyReviewEnabled: false },
    });
  }
}
