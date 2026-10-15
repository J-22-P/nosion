import { Injectable } from '@nestjs/common';
import type { CalendarDto, CalendarQuery } from '@nosion/contracts';
import { resolveDateInput } from '@nosion/core';
import { EntryStatus } from '@prisma/client';
import { ModuleRegistryService } from '../core/registry/module-registry.service';
import { toDomain } from '../entries/entry.mapper';
import { PrismaService } from '../infra/prisma/prisma.service';
import { RecurrenceService } from '../recurrence/recurrence.service';
import { UserContextService } from '../users/user-context.service';
import { buildCalendar, type CalendarSource } from './calendar-events';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * GET /calendar — ดึง entry ทุกโมดูลใน query เดียว (ไม่ใช่ N query ต่อโมดูล · สเปก 6.3)
 * + รอบที่เลย horizon ของการสร้างล่วงหน้า แล้วให้ buildCalendar ส่งต่อให้แต่ละโมดูลแปลงเป็น event
 * อยู่นอก core/ เพราะอ่าน Prisma (ADR-006)
 */
@Injectable()
export class CalendarService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: ModuleRegistryService,
    private readonly userContext: UserContextService,
    private readonly recurrence: RecurrenceService,
  ) {}

  async range(userId: string, query: CalendarQuery, now = new Date()): Promise<CalendarDto> {
    const ctx = await this.userContext.forUser(userId, now);
    const modules = this.registry.all(ctx.enabledModules);
    const start = resolveDateInput(query.from, ctx.timezone);
    // `to` รวมทั้งวัน → ขอบบนคือต้นวันถัดไปตามโซนผู้ใช้ (บวกวันบนสตริงวันที่ล้วน ไม่กระทบ DST)
    const end = resolveDateInput(
      new Date(Date.parse(query.to) + DAY_MS).toISOString().slice(0, 10),
      ctx.timezone,
    );

    const [rows, projected] = await Promise.all([
      this.prisma.entry.findMany({
        where: {
          userId,
          deletedAt: null,
          module: { in: modules.map((m) => m.key) },
          status: { not: EntryStatus.cancelled },
          occurredAt: { gte: start, lt: end },
        },
        include: { reminders: { select: { fireAt: true, channel: true, status: true } } },
        orderBy: [{ occurredAt: 'asc' }, { sortOrder: 'asc' }],
      }),
      this.recurrence.projectedEntries(userId, start, end, now),
    ]);

    const sources: CalendarSource[] = [
      ...rows.map((row) => ({ entry: toDomain(row), projected: false, reminders: row.reminders })),
      ...projected.map((entry) => ({ entry, projected: true, reminders: [] })),
    ];
    return {
      from: query.from,
      to: query.to,
      timezone: ctx.timezone,
      ...buildCalendar(sources, modules, ctx.timezone, query.module),
    };
  }
}
