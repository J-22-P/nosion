import { Injectable } from '@nestjs/common';
import type { FocusSessionDto, FocusTodayDto, TimerStopResultDto } from '@nosion/contracts';
import {
  dayBoundsInTimeZone,
  EntryNotFoundError,
  formatInTimeZone,
  InvalidStateError,
} from '@nosion/core';
import { EntryStatus, ModuleKey, Prisma, type FocusSession } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { secondsToMinutes, sessionSeconds, summarizeFocusDay } from './focus';

type Tx = Prisma.TransactionClient;

function toDto(s: FocusSession): FocusSessionDto {
  return {
    id: s.id,
    entryId: s.entryId,
    startedAt: s.startedAt.toISOString(),
    endedAt: s.endedAt?.toISOString() ?? null,
    durationSeconds: s.durationSeconds,
  };
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

/**
 * Focus timer ของงาน (สเปก 7.3 · v1.1)
 *
 * กติกา
 * - ผู้ใช้จับเวลาได้ทีละงาน — เริ่มงานใหม่ขณะอีกงานยังจับอยู่ = หยุดงานเดิมให้อัตโนมัติ
 * - start ซ้ำกับงานเดิม = ได้รอบเดิมกลับไป (idempotent — กดสองครั้ง/สองแท็บไม่เกิดรอบซ้อน)
 * - stop = บันทึกเวลาและบวกนาทีเข้า payload.actualMinutes ของงาน
 * - "หนึ่งรอบที่ยังไม่จบต่อผู้ใช้" บังคับที่ฐานข้อมูลด้วย partial unique index ไม่ใช่แค่ในโค้ด
 */
@Injectable()
export class FocusTimerService {
  constructor(private readonly prisma: PrismaService) {}

  async start(userId: string, entryId: string, now: Date = new Date()): Promise<FocusSessionDto> {
    const entry = await this.prisma.entry.findFirst({
      where: { id: entryId, userId, deletedAt: null },
      select: { id: true, module: true, status: true },
    });
    if (!entry) throw new EntryNotFoundError(entryId);
    if (entry.module !== ModuleKey.task) {
      throw new InvalidStateError('จับเวลาได้เฉพาะงาน (task)', 'timer_not_supported', {
        module: entry.module,
      });
    }
    if (entry.status === EntryStatus.done || entry.status === EntryStatus.cancelled) {
      throw new InvalidStateError('งานนี้ปิดไปแล้ว เริ่มจับเวลาไม่ได้', 'entry_closed', {
        status: entry.status,
      });
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const running = await tx.focusSession.findFirst({ where: { userId, endedAt: null } });
        if (running?.entryId === entryId) return toDto(running);
        if (running) await this.finish(tx, userId, running, now);

        const created = await tx.focusSession.create({
          data: { userId, entryId, startedAt: now },
        });
        // เริ่มลงมือแล้ว → pending กลายเป็น active (ไม่แตะสถานะอื่น)
        await tx.entry.updateMany({
          where: { id: entryId, userId, status: EntryStatus.pending },
          data: { status: EntryStatus.active, version: { increment: 1 } },
        });
        return toDto(created);
      });
    } catch (err) {
      // แพ้การแข่งกับคำขอ start อีกอันที่เข้ามาพร้อมกัน → คืนรอบที่ชนะไป
      if (!isUniqueViolation(err)) throw err;
      const winner = await this.prisma.focusSession.findFirst({ where: { userId, endedAt: null } });
      if (winner?.entryId === entryId) return toDto(winner);
      throw new InvalidStateError('มีงานอื่นกำลังจับเวลาอยู่ ลองใหม่อีกครั้ง', 'timer_busy');
    }
  }

  async stop(userId: string, entryId: string, now: Date = new Date()): Promise<TimerStopResultDto> {
    return this.prisma.$transaction(async (tx) => {
      const running = await tx.focusSession.findFirst({
        where: { userId, entryId, endedAt: null },
      });
      if (!running) {
        throw new InvalidStateError('งานนี้ไม่ได้จับเวลาอยู่', 'timer_not_running', { entryId });
      }
      return this.finish(tx, userId, running, now);
    });
  }

  async today(userId: string, now: Date = new Date()): Promise<FocusTodayDto> {
    const settings = await this.prisma.userSettings.findUnique({
      where: { userId },
      select: { timezone: true, focusGoalMinutes: true },
    });
    const timezone = settings?.timezone ?? 'Asia/Bangkok';
    const { start, end } = dayBoundsInTimeZone(now, timezone);

    const [sessions, running] = await Promise.all([
      this.prisma.focusSession.findMany({
        where: { userId, startedAt: { gte: start, lt: end }, endedAt: { not: null } },
      }),
      this.prisma.focusSession.findFirst({
        where: { userId, endedAt: null },
        include: { entry: { select: { title: true } } },
      }),
    ]);

    const summary = summarizeFocusDay(sessions, running, start, end, now);
    return {
      date: formatInTimeZone(now, timezone),
      totalSeconds: summary.totalSeconds,
      goalMinutes: settings?.focusGoalMinutes ?? 240,
      completedSessions: summary.completedSessions,
      running: running ? { ...toDto(running), entryTitle: running.entry.title } : null,
    };
  }

  /** ปิดรอบ + บวกนาทีเข้างาน — ต้องเรียกภายใน transaction เดียวกับที่อ่านรอบมา */
  private async finish(
    tx: Tx,
    userId: string,
    session: FocusSession,
    now: Date,
  ): Promise<TimerStopResultDto> {
    const seconds = sessionSeconds(session.startedAt, now);
    // where endedAt: null กันการหยุดซ้ำ (สองคำขอ stop พร้อมกัน → ตัวที่สองได้ count 0)
    const closed = await tx.focusSession.updateMany({
      where: { id: session.id, userId, endedAt: null },
      data: { endedAt: now, durationSeconds: seconds },
    });
    if (closed.count === 0) {
      throw new InvalidStateError('รอบนี้ถูกหยุดไปแล้ว', 'timer_not_running', {
        sessionId: session.id,
      });
    }

    const addedMinutes = secondsToMinutes(seconds);
    if (addedMinutes > 0) {
      const entry = await tx.entry.findFirst({
        where: { id: session.entryId, userId },
        select: { payload: true },
      });
      const payload = { ...((entry?.payload as Record<string, unknown> | null) ?? {}) };
      const current = typeof payload.actualMinutes === 'number' ? payload.actualMinutes : 0;
      payload.actualMinutes = current + addedMinutes;
      await tx.entry.updateMany({
        where: { id: session.entryId, userId },
        data: { payload: payload as Prisma.InputJsonValue, version: { increment: 1 } },
      });
    }

    return {
      session: toDto({ ...session, endedAt: now, durationSeconds: seconds }),
      addedMinutes,
    };
  }
}
