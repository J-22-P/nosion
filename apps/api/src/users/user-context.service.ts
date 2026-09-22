import { Injectable, NotFoundException } from '@nestjs/common';
import { type ModuleKey } from '@nosion/contracts';
import { type UserContext } from '@nosion/core';
import { PrismaService } from '../infra/prisma/prisma.service';

/**
 * UserContext คือสิ่งที่ engine ทุกตัวต้องรู้ (timezone, locale, สกุลเงิน, โมดูลที่เปิด)
 * ดึงที่เดียวแล้วส่งต่อเป็นพารามิเตอร์ — ไม่ให้ layer ล่างไปอ่าน DB เอง
 */
@Injectable()
export class UserContextService {
  constructor(private readonly prisma: PrismaService) {}

  async forUser(userId: string, now: Date = new Date()): Promise<UserContext> {
    const settings = await this.prisma.userSettings.findUnique({ where: { userId } });
    if (!settings) throw new NotFoundException('ไม่พบการตั้งค่าของผู้ใช้');
    return {
      userId,
      timezone: settings.timezone,
      locale: settings.locale === 'en' ? 'en' : 'th',
      currency: settings.currency,
      weekStartsOn: settings.weekStartsOn,
      enabledModules: settings.enabledModules as ModuleKey[],
      now,
    };
  }
}
