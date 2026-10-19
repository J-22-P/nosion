import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { CalendarDto, CalendarFeedDto, CalendarQuery } from '@nosion/contracts';
import { formatInTimeZone, resolveDateInput } from '@nosion/core';
import { randomBytes } from 'node:crypto';
import { EntryStatus, Prisma } from '@prisma/client';
import { ModuleRegistryService } from '../core/registry/module-registry.service';
import { toDomain } from '../entries/entry.mapper';
import { APP_CONFIG, type AppConfig } from '../infra/config/env';
import { PrismaService } from '../infra/prisma/prisma.service';
import { RecurrenceService } from '../recurrence/recurrence.service';
import { UserContextService } from '../users/user-context.service';
import { buildCalendar, type CalendarSource } from './calendar-events';
import { buildIcal } from './ical';

const DAY_MS = 24 * 60 * 60 * 1000;
/** ช่วงของ iCal feed — ย้อน 30 วัน ล่วงหน้า 180 วัน (รวมรอบ projected ของบิล) */
const FEED_PAST_DAYS = 30;
const FEED_FUTURE_DAYS = 180;
/** token ที่ rotate ใหม่: 24 byte สุ่ม = 192 bit → base64url 32 ตัว */
const FEED_TOKEN_PATTERN = /^[\w-]{20,64}$/;

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
    @Inject(APP_CONFIG) private readonly config: AppConfig,
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
          OR: [
            { occurredAt: { gte: start, lt: end } },
            // แถบหลายวัน (payload.startDate) ที่เริ่มก่อน/ในช่วง แต่วันกำหนด/วันที่เสร็จอยู่หลังต้นช่วง
            // — ดึงเกินได้ (buildCalendar ตัดที่ไม่ทับช่วงทิ้ง) แต่ห้ามขาด
            {
              AND: [
                { payload: { path: ['startDate'], not: Prisma.AnyNull } },
                { payload: { path: ['startDate'], lte: query.to } },
                { OR: [{ occurredAt: { gte: start } }, { completedAt: { gte: start } }] },
              ],
            },
          ],
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
      ...buildCalendar(sources, modules, ctx.timezone, query.module, {
        from: query.from,
        to: query.to,
      }),
    };
  }

  // ── iCal feed ────────────────────────────────────────

  async feed(userId: string): Promise<CalendarFeedDto> {
    const settings = await this.prisma.userSettings.findUnique({
      where: { userId },
      select: { calendarFeedToken: true },
    });
    if (!settings) throw new NotFoundException('ไม่พบการตั้งค่าของผู้ใช้');
    return this.feedUrls(settings.calendarFeedToken);
  }

  /** หมุน token — ลิงก์เดิมที่แชร์/subscribe ไว้ใช้ไม่ได้ทันที */
  async rotateFeed(userId: string): Promise<CalendarFeedDto> {
    const token = randomBytes(24).toString('base64url');
    await this.prisma.userSettings.update({
      where: { userId },
      data: { calendarFeedToken: token },
    });
    return this.feedUrls(token);
  }

  /** เนื้อหา .ics ของเจ้าของ token · token ไม่รู้จัก = 404 (ไม่บอกว่าผิดเพราะอะไร) */
  async ics(token: string, now = new Date()): Promise<string> {
    const settings = FEED_TOKEN_PATTERN.test(token)
      ? await this.prisma.userSettings.findUnique({
          where: { calendarFeedToken: token },
          select: { userId: true, timezone: true },
        })
      : null;
    if (!settings) throw new NotFoundException('ไม่พบปฏิทินนี้');

    const day = (offset: number) =>
      formatInTimeZone(new Date(now.getTime() + offset * DAY_MS), settings.timezone);
    const { events } = await this.range(
      settings.userId,
      { from: day(-FEED_PAST_DAYS), to: day(FEED_FUTURE_DAYS) },
      now,
    );
    return buildIcal(events, { name: 'NOSION', timeZone: settings.timezone, now });
  }

  /** .ics ของช่วงวันที่ — สำหรับนำเข้าครั้งเดียว (UID เดียวกับ feed → นำเข้าซ้ำแล้วทับของเดิม ไม่เบิ้ล) */
  async exportRange(userId: string, query: CalendarQuery, now = new Date()): Promise<string> {
    const { events, timezone } = await this.range(userId, query, now);
    return buildIcal(events, {
      name: `NOSION ${query.from} – ${query.to}`,
      timeZone: timezone,
      now,
    });
  }

  private feedUrls(token: string): CalendarFeedDto {
    const url = `${this.config.API_URL}/api/v1/calendar/${token}.ics`;
    return { url, webcalUrl: url.replace(/^https?:/, 'webcal:') };
  }
}
