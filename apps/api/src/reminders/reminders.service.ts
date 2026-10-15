import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import {
  createReminderSchema,
  type CreateReminderInput,
  type ReminderDto,
  type ReminderInput,
} from '@nosion/contracts';
import { EntryNotFoundError } from '@nosion/core';
import type { Prisma, Reminder } from '@prisma/client';
import { ModuleRegistryService } from '../core/registry/module-registry.service';
import { PrismaService } from '../infra/prisma/prisma.service';
import { fireAtFor, reminderKey, rescheduleData } from './reminder-plan';

/**
 * การเตือนฝั่ง API (สเปก 6.2) — ที่นี่แค่ "จด" ว่าต้องเตือนเมื่อไร ลง PostgreSQL ซึ่งเป็น source of truth
 * การยิงจริงเป็นงานของ worker (sweeper ดึงที่ใกล้ถึงเวลาเข้าคิว แล้ว processor ส่ง)
 *
 * entry ที่ทำเสร็จ / ถูกลบ / ไม่มีวันแล้ว ไม่ต้องแก้ reminder ตอนเขียน —
 * worker ตรวจสถานะ entry ล่าสุดก่อนยิงทุกครั้ง (guard clauses) จึงมีจุด sync น้อยที่สุด
 * มีแค่ "entry ย้ายวัน" ที่ต้องเลื่อน fireAt ตาม (rescheduleForEntries)
 */
@Injectable()
export class RemindersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: ModuleRegistryService,
  ) {}

  async list(userId: string, entryId: string): Promise<ReminderDto[]> {
    await this.requireEntry(userId, entryId);
    const rows = await this.prisma.reminder.findMany({
      where: { entryId },
      orderBy: [{ fireAt: 'asc' }, { channel: 'asc' }],
    });
    return rows.map(toReminderDto);
  }

  /** เพิ่มการเตือน — ช่องทาง + offset เดิมซ้ำได้ (idempotent) และตั้งเตือนใหม่ถ้าเคยส่ง/ยกเลิกไปแล้ว */
  async add(userId: string, entryId: string, input: CreateReminderInput): Promise<ReminderDto> {
    const dto = createReminderSchema.parse(input);
    const entry = await this.requireEntry(userId, entryId);
    if (!this.registry.get(entry.module).supportsReminder) {
      throw new UnprocessableEntityException(`โมดูล ${entry.module} ไม่รองรับการเตือน`);
    }
    if (!entry.occurredAt) {
      throw new UnprocessableEntityException('ตั้งวันกำหนดของรายการก่อนจึงจะตั้งเตือนได้');
    }
    const fireAt = fireAtFor(entry.occurredAt, dto.offsetMinutes);
    const row = await this.prisma.reminder.upsert({
      where: { idempotencyKey: reminderKey(entryId, dto.channel, dto.offsetMinutes) },
      create: {
        entryId,
        channel: dto.channel,
        offsetMinutes: dto.offsetMinutes,
        fireAt,
        idempotencyKey: reminderKey(entryId, dto.channel, dto.offsetMinutes),
      },
      update: {
        fireAt,
        status: 'scheduled',
        attempts: 0,
        sentAt: null,
        lastError: null,
        jobId: null,
      },
    });
    return toReminderDto(row);
  }

  /** ยกเลิก (ไม่ลบแถว — เก็บประวัติว่าเคยตั้งไว้) · ซ้ำได้ */
  async cancel(userId: string, id: string): Promise<void> {
    const row = await this.prisma.reminder.findFirst({
      where: { id, entry: { userId } },
      select: { id: true },
    });
    if (!row) throw new NotFoundException('ไม่พบการเตือน');
    await this.prisma.reminder.update({
      where: { id },
      data: { status: 'cancelled', jobId: null },
    });
  }

  // ── ใช้ภายใน transaction ของ EntriesService / RecurrenceService ──

  /** สร้างการเตือนให้ entry ใหม่ (สร้างรายการพร้อมเตือน / materialize รอบจากกฎ) — ซ้ำได้ */
  async createForEntries(
    tx: Prisma.TransactionClient,
    entries: { id: string; module: string; occurredAt: Date | null }[],
    inputs: ReminderInput[],
  ): Promise<number> {
    if (!inputs.length) return 0;
    const data = entries.flatMap((entry) =>
      entry.occurredAt && this.registry.get(entry.module as never).supportsReminder
        ? inputs.map((r) => ({
            entryId: entry.id,
            channel: r.channel,
            offsetMinutes: r.offsetMinutes,
            fireAt: fireAtFor(entry.occurredAt!, r.offsetMinutes),
            idempotencyKey: reminderKey(entry.id, r.channel, r.offsetMinutes),
          }))
        : [],
    );
    if (!data.length) return 0;
    const result = await tx.reminder.createMany({ data, skipDuplicates: true });
    return result.count;
  }

  /** entry ย้ายวัน → เลื่อนการเตือนตาม (ไม่มีวันแล้ว = ปล่อยไว้ worker ข้ามเองตอนถึงเวลา) */
  async rescheduleForEntries(
    tx: Prisma.TransactionClient,
    entryIds: string[],
    occurredAt: Date | null,
    now = new Date(),
  ): Promise<void> {
    if (!occurredAt || !entryIds.length) return;
    const rows = await tx.reminder.findMany({
      where: { entryId: { in: entryIds }, status: { not: 'cancelled' } },
      select: { id: true, offsetMinutes: true, status: true },
    });
    for (const row of rows) {
      const data = rescheduleData(row, occurredAt, now);
      if (data) await tx.reminder.update({ where: { id: row.id }, data });
    }
  }

  private async requireEntry(userId: string, entryId: string) {
    const entry = await this.prisma.entry.findFirst({
      where: { id: entryId, userId, deletedAt: null },
      select: { id: true, module: true, occurredAt: true },
    });
    if (!entry) throw new EntryNotFoundError(entryId);
    return entry;
  }
}

export function toReminderDto(row: Reminder): ReminderDto {
  return {
    id: row.id,
    entryId: row.entryId,
    channel: row.channel,
    offsetMinutes: row.offsetMinutes,
    fireAt: row.fireAt.toISOString(),
    status: row.status,
    attempts: row.attempts,
    lastError: row.lastError,
    sentAt: row.sentAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
