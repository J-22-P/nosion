import { Injectable, Logger } from '@nestjs/common';
import type { ModuleKey, TodayDto } from '@nosion/contracts';
import { dayBoundsInTimeZone, formatInTimeZone, type Entry, type TodayWidget } from '@nosion/core';
import { EntryStatus } from '@prisma/client';
import { toDomain } from '../entry.mapper';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { UserContextService } from '../../users/user-context.service';
import { ModuleRegistryService } from '../../core/registry/module-registry.service';
import { greetingFor, toWidgetDto } from './today';

/**
 * GET /today — หัวใจของแอป (สเปก 7.4)
 *
 * ไฟล์นี้ไม่มีชื่อโมดูลไหนอยู่เลย: วนลูป registry แล้วให้แต่ละโมดูลสรุปการ์ดของตัวเอง
 * เพิ่มโมดูลใหม่ → การ์ดใหม่โผล่ในหน้า Today เองโดยไม่แก้ไฟล์นี้
 *
 * อยู่ในชั้น entries/ (ไม่ใช่ core/) เพราะต้องอ่าน Prisma — lint บังคับว่า core/ ใช้ domain type เท่านั้น
 */
@Injectable()
export class TodayService {
  private readonly logger = new Logger(TodayService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: ModuleRegistryService,
    private readonly userContext: UserContextService,
  ) {}

  async today(userId: string, now: Date = new Date()): Promise<TodayDto> {
    const ctx = await this.userContext.forUser(userId, now);
    const modules = this.registry.all(ctx.enabledModules);
    const { start, end } = dayBoundsInTimeZone(now, ctx.timezone);

    const [user, rows] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { displayName: true } }),
      // "เกี่ยวกับวันนี้" แบบกลาง ๆ — แต่ละโมดูลกรองต่อเองตามความหมายของตัวเอง
      this.prisma.entry.findMany({
        where: {
          userId,
          module: { in: modules.map((m) => m.key) },
          deletedAt: null,
          status: { not: EntryStatus.cancelled },
          OR: [
            { occurredAt: { gte: start, lt: end } }, // เกิด/ครบกำหนดวันนี้
            { occurredAt: null, createdAt: { gte: start, lt: end } }, // ไม่มีวันที่ แต่สร้างวันนี้
            {
              occurredAt: { lt: start }, // ค้างจากวันก่อน (งานเลยกำหนด, บิลค้างจ่าย)
              status: { in: [EntryStatus.pending, EntryStatus.active] },
            },
            { completedAt: { gte: start, lt: end } }, // ทำเสร็จวันนี้
          ],
        },
        orderBy: [{ occurredAt: 'asc' }, { sortOrder: 'asc' }],
      }),
    ]);

    const byModule = new Map<ModuleKey, Entry[]>(modules.map((m) => [m.key, []]));
    for (const row of rows) byModule.get(row.module)?.push(toDomain(row));

    // การ์ดหนึ่งพังต้องไม่ลากทั้งหน้าพัง — allSettled แล้วรายงานว่าโมดูลไหนล้ม
    const settled = await Promise.allSettled(
      modules.map(async (m) => m.summarizeToday(byModule.get(m.key) ?? [], ctx)),
    );
    const widgets: TodayWidget[] = [];
    const failedModules: ModuleKey[] = [];
    settled.forEach((result, i) => {
      const key = modules[i]!.key;
      if (result.status === 'fulfilled') widgets.push(result.value);
      else {
        failedModules.push(key);
        this.logger.error(`summarizeToday ของโมดูล ${key} ล้ม: ${String(result.reason)}`);
      }
    });

    return {
      date: formatInTimeZone(now, ctx.timezone),
      timezone: ctx.timezone,
      greeting: greetingFor(now, ctx.timezone, user.displayName, ctx.locale),
      widgets: widgets.sort((a, b) => a.order - b.order).map(toWidgetDto),
      failedModules,
    };
  }
}
