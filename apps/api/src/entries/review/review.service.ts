import { Injectable, Logger, UnprocessableEntityException } from '@nestjs/common';
import type { ModuleKey, WeeklyReviewDto, WeeklySectionDto } from '@nosion/contracts';
import { formatInTimeZone, resolveDateInput, type Entry } from '@nosion/core';
import { EntryStatus } from '@prisma/client';
import { ModuleRegistryService } from '../../core/registry/module-registry.service';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { UserContextService } from '../../users/user-context.service';
import { toDomain } from '../entry.mapper';
import { addDays, isoWeekOf, mondayOfIsoWeek, shiftWeek } from './iso-week';

/**
 * GET /review/weekly (สเปก 7.3 · Phase 6) — ไม่มีชื่อโมดูลไหนอยู่ในไฟล์นี้ (เหมือน TodayService)
 * ดึง entry ทุกโมดูลของสัปดาห์ใน query เดียว แล้วให้แต่ละโมดูล `summarizeWeek()` ส่วนของตัวเอง
 * "ของสัปดาห์นี้" = เกิด/ครบกำหนดในสัปดาห์ หรือทำเสร็จในสัปดาห์ (งานเก่าที่ปิดได้สัปดาห์นี้ก็นับ)
 */
@Injectable()
export class ReviewService {
  private readonly logger = new Logger(ReviewService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: ModuleRegistryService,
    private readonly userContext: UserContextService,
  ) {}

  async weekly(
    userId: string,
    week: string | undefined,
    now = new Date(),
  ): Promise<WeeklyReviewDto> {
    const ctx = await this.userContext.forUser(userId, now);
    const target = week ?? isoWeekOf(formatInTimeZone(now, ctx.timezone));
    let monday: string;
    try {
      monday = mondayOfIsoWeek(target);
    } catch (err) {
      throw new UnprocessableEntityException((err as Error).message);
    }
    const start = resolveDateInput(monday, ctx.timezone);
    const end = resolveDateInput(addDays(monday, 7), ctx.timezone);
    const modules = this.registry.all(ctx.enabledModules);

    const rows = await this.prisma.entry.findMany({
      where: {
        userId,
        deletedAt: null,
        module: { in: modules.map((m) => m.key) },
        status: { not: EntryStatus.cancelled },
        OR: [{ occurredAt: { gte: start, lt: end } }, { completedAt: { gte: start, lt: end } }],
      },
      orderBy: [{ occurredAt: 'asc' }],
    });
    const byModule = new Map<ModuleKey, Entry[]>(modules.map((m) => [m.key, []]));
    for (const row of rows) byModule.get(row.module)?.push(toDomain(row));

    // ส่วนหนึ่งพังต้องไม่ลากทั้งหน้า — เหมือนการ์ดของ Today
    const settled = await Promise.allSettled(
      modules.map(async (m) => m.summarizeWeek(byModule.get(m.key) ?? [], ctx)),
    );
    const sections: WeeklySectionDto[] = [];
    const failedModules: ModuleKey[] = [];
    settled.forEach((result, i) => {
      const key = modules[i]!.key;
      if (result.status === 'fulfilled') sections.push(result.value);
      else {
        failedModules.push(key);
        this.logger.error(`summarizeWeek ของโมดูล ${key} ล้ม: ${String(result.reason)}`);
      }
    });

    return {
      week: target,
      from: monday,
      to: addDays(monday, 6),
      timezone: ctx.timezone,
      previousWeek: shiftWeek(target, -1),
      nextWeek: shiftWeek(target, 1),
      sections: sections.sort((a, b) => a.order - b.order),
      failedModules,
    };
  }
}
