import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import {
  habitPayloadSchema,
  recurrenceTemplateSchema,
  type HabitDto,
  type HabitListDto,
  type HabitPayload,
  type HabitTodayDto,
} from '@nosion/contracts';
import { formatInTimeZone, resolveDateInput } from '@nosion/core';
import { EntryStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { UserContextService } from '../../users/user-context.service';
import { dailyStreak, dayState, weeklyStreak, type HabitDay } from './habit-streak';
import { isDone } from './habit.trackable';

const DAY_MS = 24 * 60 * 60 * 1000;
/** ย้อนดูประวัติกี่วันเพื่อหา streak ที่ยาวที่สุด */
const HISTORY_DAYS = 400;

const addDays = (ymd: string, n: number) =>
  new Date(Date.parse(`${ymd}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

/**
 * endpoint เฉพาะนิสัย — อ่าน/เขียนผ่าน Prisma เอง (กฎ boundaries: โมดูลไม่ import entries/ หรือ recurrence/)
 * การสร้าง/หยุด/ลบนิสัยใช้ /recurrence-rules และ /parse/commit ที่มีอยู่แล้ว
 */
@Injectable()
export class HabitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly userContext: UserContextService,
  ) {}

  /** GET /habits — นิสัยทั้งหมด + รอบวันนี้ + streak + แถบ 7 วัน ในสองคำขอ DB */
  async list(userId: string, now = new Date()): Promise<HabitListDto> {
    const ctx = await this.userContext.forUser(userId, now);
    const tz = ctx.timezone;
    const today = formatInTimeZone(now, tz);

    const rules = await this.prisma.forUser(userId).recurrenceRule.findMany({
      where: { deletedAt: null, template: { path: ['module'], equals: 'habit' } },
      orderBy: { createdAt: 'asc' },
    });
    const entries = rules.length
      ? await this.prisma.forUser(userId).entry.findMany({
          where: {
            module: 'habit',
            deletedAt: null,
            recurrenceRuleId: { in: rules.map((r) => r.id) },
            occurredAt: {
              gte: resolveDateInput(addDays(today, -HISTORY_DAYS), tz),
              lt: resolveDateInput(addDays(today, 1), tz),
            },
          },
          orderBy: { occurredAt: 'asc' },
        })
      : [];

    const week = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
    const habits: HabitDto[] = [];
    for (const rule of rules) {
      const template = recurrenceTemplateSchema.safeParse(rule.template);
      if (!template.success) continue;
      const p = habitPayloadSchema.safeParse(template.data.payload);
      if (!p.success) continue;

      const own = entries.filter((e) => e.recurrenceRuleId === rule.id);
      const days: HabitDay[] = own.map((e) => ({
        date: formatInTimeZone(e.occurredAt!, tz),
        complete: isDone({ status: e.status, payload: e.payload as HabitPayload }),
        skipped: e.status === EntryStatus.skipped,
      }));
      const byDate = new Map(days.map((d) => [d.date, d]));
      const todayEntry = own.find((e) => formatInTimeZone(e.occurredAt!, tz) === today);
      const weekly = p.data.cadence === 'weekly' && p.data.weeklyTarget;
      const streak = weekly
        ? weeklyStreak(days, p.data.weeklyTarget!, today, ctx.weekStartsOn)
        : dailyStreak(days, today);

      habits.push({
        ruleId: rule.id,
        title: template.data.title,
        kind: p.data.kind,
        targetValue: p.data.targetValue,
        unit: p.data.unit,
        deadlineLocalTime: p.data.deadlineLocalTime,
        subtitle: p.data.subtitle,
        cadence: p.data.cadence,
        weeklyTarget: p.data.weeklyTarget,
        isPaused: rule.isPaused,
        today: todayEntry ? toToday(todayEntry) : null,
        streak: { ...streak, unit: weekly ? 'week' : 'day' },
        last7: week.map((date) => ({ date, state: dayState(byDate.get(date), today) })),
        weekProgress: weekly
          ? {
              done: days.filter((d) => d.complete && sameWeek(d.date, today, ctx.weekStartsOn))
                .length,
              target: p.data.weeklyTarget!,
            }
          : null,
      });
    }
    return { date: today, timezone: tz, habits };
  }

  /** ปุ่ม −1 / +1 — ไม่ต่ำกว่า 0 · ถึงเป้า = done · ลดต่ำกว่าเป้า = กลับเป็น pending */
  increment(
    userId: string,
    entryId: string,
    delta: 1 | -1,
    now = new Date(),
  ): Promise<HabitTodayDto> {
    const value = Prisma.sql`GREATEST(0, COALESCE((payload->>'currentValue')::numeric, 0) + ${delta})`;
    return this.write(userId, entryId, value, now);
  }

  /** ติ๊กทำแล้ว / ยกเลิก — ทำแล้ว = currentValue เท่าเป้า */
  check(userId: string, entryId: string, done: boolean, now = new Date()): Promise<HabitTodayDto> {
    const value = Prisma.sql`(CASE WHEN ${done} THEN (payload->>'targetValue')::numeric ELSE 0 END)`;
    return this.write(userId, entryId, value, now);
  }

  /**
   * เขียน currentValue + สถานะใน UPDATE เดียว โดยให้ Postgres คำนวณค่าใหม่จากแถวล่าสุดเอง
   * กด +1 พร้อมกันหลายครั้ง: แต่ละ UPDATE รอ row lock แล้วคำนวณจากค่าที่ตัวก่อนหน้าเขียนไว้ (READ COMMITTED
   * ประเมินนิพจน์ใน SET ใหม่กับแถวเวอร์ชันล่าสุด) → นับไม่หาย ไม่ต้อง retry
   * (รุ่นแรกอ่าน → คำนวณใน Node → เขียนด้วยเงื่อนไข version แล้ว retry 3 รอบ — กด 8 ครั้งพร้อมกันแล้วค่าหาย)
   */
  private async write(
    userId: string,
    entryId: string,
    value: Prisma.Sql,
    now: Date,
  ): Promise<HabitTodayDto> {
    const target = Prisma.sql`(payload->>'targetValue')::numeric`;
    const updated = await this.prisma.$queryRaw<{ id: string }[]>`
      UPDATE entries SET
        payload = jsonb_set(payload, '{currentValue}', to_jsonb(${value})),
        status = CASE WHEN ${value} >= ${target} THEN 'done'::"EntryStatus" ELSE 'pending'::"EntryStatus" END,
        "completedAt" = CASE WHEN ${value} >= ${target} THEN COALESCE("completedAt", ${now}) ELSE NULL END,
        version = version + 1,
        "updatedAt" = ${now}
      WHERE id = ${entryId} AND "userId" = ${userId} AND module = 'habit' AND "deletedAt" IS NULL
      RETURNING id`;
    if (updated.length === 0) throw new NotFoundException('ไม่พบรอบของนิสัยนี้');
    const after = await this.prisma.entry.findUniqueOrThrow({ where: { id: entryId } });
    if (!habitPayloadSchema.safeParse(after.payload).success) {
      throw new UnprocessableEntityException('ข้อมูลนิสัยไม่ถูกต้อง');
    }
    return toToday(after);
  }
}

function sameWeek(a: string, b: string, weekStartsOn: number): boolean {
  const start = (ymd: string) => {
    const d = new Date(`${ymd}T00:00:00Z`);
    return addDays(ymd, -((d.getUTCDay() - weekStartsOn + 7) % 7));
  };
  return start(a) === start(b);
}

function toToday(e: {
  id: string;
  payload: Prisma.JsonValue;
  status: EntryStatus;
  completedAt: Date | null;
  version: number;
}): HabitTodayDto {
  const p = e.payload as HabitPayload;
  return {
    entryId: e.id,
    currentValue: p.currentValue ?? 0,
    status: isDone({ status: e.status, payload: p }) ? 'done' : e.status,
    completedAt: e.completedAt?.toISOString() ?? null,
    version: e.version,
  };
}
