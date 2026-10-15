import {
  BadRequestException,
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  type BulkActionInput,
  type CreateEntryInput,
  type EntryDto,
  type ListEntriesQuery,
  type Paginated,
  type RecurrenceScope,
  type UpdateEntryInput,
  createEntrySchema,
  updateEntrySchema,
} from '@nosion/contracts';
import {
  EntryNotFoundError,
  PayloadValidationError,
  dayBoundsInTimeZone,
  resolveDateInput,
  VersionConflictError,
  type EntryWriteEvent,
  type EntryWriteOperation,
} from '@nosion/core';
import { EntryStatus, Prisma } from '@prisma/client';
import type { z } from 'zod';
import { ModuleRegistryService } from '../core/registry/module-registry.service';
import { RecurrenceService } from '../recurrence/recurrence.service';
import { RemindersService } from '../reminders/reminders.service';
import { overdueWhere } from '../common/overdue-where';
import { completedAtFor } from './completed-at';
import { resolveDeferTarget } from './defer';
import { PrismaService } from '../infra/prisma/prisma.service';
import { UserContextService } from '../users/user-context.service';
import { parseSort, toDomain, toDto, type EntryWithRelations } from './entry.mapper';

const INCLUDE_RELATIONS = { tags: { include: { tag: true } } } as const;

export const ENTRY_WRITE_EVENT = 'entry.write';

@Injectable()
export class EntriesService {
  private readonly logger = new Logger(EntriesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: ModuleRegistryService,
    private readonly userContext: UserContextService,
    private readonly events: EventEmitter2,
    private readonly recurrence: RecurrenceService,
    private readonly reminders: RemindersService,
  ) {}

  // ── อ่าน ─────────────────────────────────────────────

  async list(userId: string, query: ListEntriesQuery): Promise<Paginated<EntryDto>> {
    const db = this.prisma.forUser(userId);
    const { timezone } = await this.userContext.forUser(userId);
    const where = this.buildWhere(query, timezone);
    const orderBy = parseSort(query.sort);

    const rows = await db.entry.findMany({
      where,
      orderBy,
      include: INCLUDE_RELATIONS,
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;

    return {
      data: page.map((row) => toDto(row as EntryWithRelations)),
      pageInfo: {
        nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null,
        hasMore,
      },
      ...(query.withTotal ? { meta: { total: await db.entry.count({ where }) } } : {}),
    };
  }

  async findOne(userId: string, id: string): Promise<EntryDto> {
    const row = await this.requireEntry(userId, id);
    return toDto(row);
  }

  async trash(userId: string, query: ListEntriesQuery): Promise<Paginated<EntryDto>> {
    const db = this.prisma.forUser(userId);
    const rows = await db.entry.findMany({
      where: { deletedAt: { not: null } },
      orderBy: { deletedAt: 'desc' },
      include: INCLUDE_RELATIONS,
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    return {
      data: page.map((row) => toDto(row as EntryWithRelations)),
      pageInfo: { nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null, hasMore },
    };
  }

  // ── เขียน ────────────────────────────────────────────

  async create(userId: string, input: CreateEntryInput): Promise<EntryDto> {
    const dto = createEntrySchema.parse(input);
    this.registry.get(dto.module); // โมดูลต้องมีอยู่จริง — ไม่มี = 422 ก่อนเขียนอะไร
    const { timezone } = await this.userContext.forUser(userId);
    const occurredAt = dto.occurredAt ? resolveDateInput(dto.occurredAt, timezone) : null;
    // ส่งมาแค่วันที่ = งานทั้งวันแน่นอน (ไม่มีเวลาให้ "เลย")
    const isAllDay = typeof dto.occurredAt === 'string' ? true : dto.isAllDay;
    const payload = this.validatePayload(dto.module, dto.payload);

    if (dto.clientId) {
      // idempotent: offline client ยิงซ้ำได้โดยไม่เกิดรายการซ้ำ
      const existing = await this.prisma
        .forUser(userId)
        .entry.findFirst({ where: { clientId: dto.clientId }, include: INCLUDE_RELATIONS });
      if (existing) return toDto(existing as EntryWithRelations);
    }

    // entry + การเตือนสำเร็จหรือล้มพร้อมกัน · key ของการเตือนผูกกับ id ของ entry (ดู reminderKey)
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.entry.create({
        data: {
          userId,
          module: dto.module,
          title: dto.title,
          description: dto.description ?? null,
          status: dto.status,
          priority: dto.priority,
          occurredAt,
          isAllDay,
          payload: payload as Prisma.InputJsonValue,
          projectId: dto.projectId ?? null,
          parentId: dto.parentId ?? null,
          clientId: dto.clientId ?? null,
          ...(dto.tagIds.length
            ? { tags: { create: dto.tagIds.map((tagId) => ({ tagId })) } }
            : {}),
        },
        include: INCLUDE_RELATIONS,
      });
      await this.reminders.createForEntries(tx, [created], dto.reminders);
      return created;
    });

    await this.emitWrite('create', userId, row as EntryWithRelations, null);
    return toDto(row as EntryWithRelations);
  }

  /**
   * แก้ entry — `scope` มีผลเฉพาะ entry ที่มาจากกฎการเกิดซ้ำ (สเปก 6.1)
   *  - `this`: แก้รอบนี้ตรง ๆ · ถ้าเลื่อนวันเวลา slot เดิมเข้า exceptions ของกฎ
   *  - `series`: แก้รอบนี้ + template ของกฎใน transaction เดียว (ดู updateSeries)
   */
  async update(
    userId: string,
    id: string,
    input: UpdateEntryInput,
    scope: RecurrenceScope = 'this',
    now = new Date(),
  ): Promise<EntryDto> {
    const dto = updateEntrySchema.parse(input);
    const before = await this.requireEntry(userId, id);
    if (scope === 'series') return this.updateSeries(userId, before, dto, now);

    const { timezone } = await this.userContext.forUser(userId);
    const { data, occurredAt } = this.buildUpdate(before, dto, timezone);
    const moved =
      occurredAt !== undefined && occurredAt?.getTime() !== before.occurredAt?.getTime();

    // optimistic concurrency: แพ้แล้วไม่เขียนทับ — บอก client ให้ merge เอง
    const won = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.entry.updateMany({
        where: { id, userId, version: dto.version, deletedAt: null },
        data,
      });
      if (updated.count === 0) return false;
      if (dto.tagIds !== undefined) await replaceTags(tx, id, dto.tagIds);
      // "เลื่อนเฉพาะครั้งนี้" = แก้ entry ตรง ๆ + เพิ่มวันเดิมเข้า exceptions (สเปก 6.1)
      if (moved) {
        await this.detachFromSeries(tx, userId, before);
        await this.reminders.rescheduleForEntries(tx, [id], occurredAt ?? null, now);
      }
      return true;
    });
    if (!won) await this.throwConflict(userId, id, dto.version);

    const after = await this.requireEntry(userId, id);
    await this.emitWrite('update', userId, after, before);
    return toDto(after);
  }

  /**
   * แก้ "ทั้ง series" จากรายการหนึ่งรอบ: รอบนี้ + template ของกฎ แล้วสร้างรอบอนาคตที่ยังไม่ถูกแตะใหม่
   * รอบที่ผ่านไปแล้วหรือผู้ใช้แก้เองแล้วไม่เปลี่ยน (ประวัติเป็นของผู้ใช้)
   * วันเวลาและสถานะเป็นของรอบใดรอบหนึ่ง — เปลี่ยนตารางต้องทำที่ /recurrence-rules → 422
   */
  private async updateSeries(
    userId: string,
    before: EntryWithRelations,
    dto: z.infer<typeof updateEntrySchema>,
    now: Date,
  ): Promise<EntryDto> {
    const ruleId = before.recurrenceRuleId;
    if (!ruleId) {
      throw new UnprocessableEntityException('รายการนี้ไม่ได้มาจากกฎการเกิดซ้ำ — ใช้ scope=this');
    }
    const perOccurrence = (['occurredAt', 'isAllDay', 'status'] as const).filter(
      (key) => dto[key] !== undefined,
    );
    if (perOccurrence.length) {
      throw new UnprocessableEntityException(
        `แก้ ${perOccurrence.join(', ')} ทั้ง series ไม่ได้ — เปลี่ยนตารางที่ /recurrence-rules/${ruleId} หรือใช้ scope=this`,
      );
    }

    // ตรวจ template ก่อนเปิด transaction — 404/422 ต้องเกิดก่อนเขียนอะไรทั้งนั้น
    const template = await this.recurrence.seriesTemplateFor(userId, ruleId, {
      title: dto.title,
      description: dto.description,
      priority: dto.priority,
      payload: dto.payload,
      projectId: dto.projectId,
      tagIds: dto.tagIds,
    });
    const { timezone } = await this.userContext.forUser(userId);
    const { data } = this.buildUpdate(before, dto, timezone);

    const won = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.entry.updateMany({
        where: { id: before.id, userId, version: dto.version, deletedAt: null },
        data,
      });
      if (updated.count === 0) return false;
      if (dto.tagIds !== undefined) await replaceTags(tx, before.id, dto.tagIds);
      // รอบนี้ถูกแก้แล้ว (version > 1) จึงไม่ถูกลบไปพร้อมรอบอนาคตที่ยังไม่แตะ
      await this.recurrence.replaceTemplate(tx, userId, ruleId, template, now);
      return true;
    });
    if (!won) await this.throwConflict(userId, before.id, dto.version);

    // หลัง commit — ถ้าพังตรงนี้ cron รอบถัดไปเติมให้เอง (materializedUntil ถูกตั้งเป็น now แล้ว)
    await this.recurrence.materializeRule(userId, ruleId, now);
    const after = await this.requireEntry(userId, before.id);
    await this.emitWrite('update', userId, after, before);
    return toDto(after);
  }

  async complete(userId: string, id: string): Promise<EntryDto> {
    const before = await this.requireEntry(userId, id);
    const now = new Date();
    await this.prisma.entry.updateMany({
      where: { id, userId, deletedAt: null },
      data: { status: EntryStatus.done, completedAt: now, version: { increment: 1 } },
    });
    const after = await this.requireEntry(userId, id);
    await this.emitWrite('complete', userId, after, before);
    return toDto(after);
  }

  /** เลื่อนกำหนด + นับ deferCount ไว้ทำสถิติ "งานที่ผัดบ่อยที่สุด" */
  async defer(userId: string, id: string, to: string): Promise<EntryDto> {
    const before = await this.requireEntry(userId, id);
    const { timezone } = await this.userContext.forUser(userId);
    const target = resolveDeferTarget(to, before.occurredAt ?? new Date(), timezone);
    const payload = { ...(before.payload as Record<string, unknown>) };
    if (typeof payload.deferCount === 'number') payload.deferCount += 1;

    await this.prisma.$transaction(async (tx) => {
      await tx.entry.updateMany({
        where: { id, userId, deletedAt: null },
        data: {
          occurredAt: target,
          payload: payload as Prisma.InputJsonValue,
          version: { increment: 1 },
        },
      });
      await this.detachFromSeries(tx, userId, before);
      await this.reminders.rescheduleForEntries(tx, [id], target);
    });
    const after = await this.requireEntry(userId, id);
    await this.emitWrite('update', userId, after, before);
    return toDto(after);
  }

  /**
   * soft delete — entry จากกฎการเกิดซ้ำ:
   *  - `this`: slot เข้า exceptions (เหมือน DELETE /recurrence-rules/:id/occurrences/:date)
   *  - `series`: จบกฎด้วย — รอบอนาคตที่ยังไม่แตะหาย รอบที่ผ่านแล้วหรือแก้แล้วอยู่ต่อ
   */
  async remove(
    userId: string,
    id: string,
    scope: RecurrenceScope = 'this',
    now = new Date(),
  ): Promise<void> {
    const before = await this.requireEntry(userId, id);
    const ruleId = before.recurrenceRuleId;
    if (scope === 'series' && !ruleId) {
      throw new UnprocessableEntityException('รายการนี้ไม่ได้มาจากกฎการเกิดซ้ำ — ใช้ scope=this');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.entry.updateMany({
        where: { id, userId, deletedAt: null },
        data: { deletedAt: now, version: { increment: 1 } },
      });
      if (scope === 'series' && ruleId) await this.recurrence.endSeries(tx, userId, ruleId, now);
      else await this.detachFromSeries(tx, userId, before);
    });
    await this.emitWrite('delete', userId, before, before);
  }

  async restore(userId: string, id: string): Promise<EntryDto> {
    const restored = await this.prisma.entry.updateMany({
      where: { id, userId, deletedAt: { not: null } },
      data: { deletedAt: null, version: { increment: 1 } },
    });
    if (restored.count === 0) throw new EntryNotFoundError(id);
    const after = await this.requireEntry(userId, id);
    await this.emitWrite('restore', userId, after, null);
    return toDto(after);
  }

  async bulk(userId: string, input: BulkActionInput): Promise<{ affected: number }> {
    const where = { id: { in: input.ids }, userId, deletedAt: null };
    switch (input.action) {
      case 'complete': {
        const res = await this.prisma.entry.updateMany({
          where,
          data: { status: EntryStatus.done, completedAt: new Date(), version: { increment: 1 } },
        });
        return { affected: res.count };
      }
      // ลบ/เลื่อนหลายรายการ = "เฉพาะรอบนี้" ของแต่ละรายการ → slot ของรายการที่มาจากกฎเข้า exceptions
      case 'delete': {
        return this.prisma.$transaction(async (tx) => {
          const targets = await tx.entry.findMany({ where, select: { id: true } });
          const res = await tx.entry.updateMany({
            where,
            data: { deletedAt: new Date(), version: { increment: 1 } },
          });
          await this.detachManyFromSeries(
            tx,
            userId,
            targets.map((t) => t.id),
          );
          return { affected: res.count };
        });
      }
      case 'defer': {
        const { timezone } = await this.userContext.forUser(userId);
        const target = resolveDeferTarget(input.to ?? 'tomorrow', new Date(), timezone);
        return this.prisma.$transaction(async (tx) => {
          // หา id ก่อนอัปเดต — หลังอัปเดตแยกไม่ออกว่ารายการไหนเพิ่งถูกเลื่อน
          const targets = await tx.entry.findMany({ where, select: { id: true } });
          const res = await tx.entry.updateMany({
            where,
            data: { occurredAt: target, version: { increment: 1 } },
          });
          const ids = targets.map((t) => t.id);
          await this.detachManyFromSeries(tx, userId, ids);
          await this.reminders.rescheduleForEntries(tx, ids, target);
          return { affected: res.count };
        });
      }
      case 'move': {
        if (!input.to) throw new BadRequestException('ต้องระบุ projectId ที่จะย้ายไป');
        const res = await this.prisma.entry.updateMany({
          where,
          data: { projectId: input.to, version: { increment: 1 } },
        });
        return { affected: res.count };
      }
    }
  }

  async reorder(userId: string, items: { id: string; sortOrder: number }[]): Promise<void> {
    await this.prisma.$transaction(
      items.map((item) =>
        this.prisma.entry.updateMany({
          where: { id: item.id, userId },
          data: { sortOrder: item.sortOrder },
        }),
      ),
    );
  }

  // ── ภายใน ────────────────────────────────────────────

  /** แปลง dto ของ PATCH เป็นข้อมูลที่จะเขียน — ใช้ร่วมกันทั้ง scope=this และ series */
  private buildUpdate(
    before: EntryWithRelations,
    dto: z.infer<typeof updateEntrySchema>,
    timezone: string,
  ): { data: Prisma.EntryUncheckedUpdateManyInput; occurredAt: Date | null | undefined } {
    const occurredAt =
      dto.occurredAt === undefined
        ? undefined
        : dto.occurredAt === null
          ? null
          : resolveDateInput(dto.occurredAt, timezone);
    const isAllDay = typeof dto.occurredAt === 'string' ? true : dto.isAllDay;

    const payload =
      dto.payload !== undefined
        ? this.validatePayload(before.module, { ...(before.payload as object), ...dto.payload })
        : undefined;

    const data: Prisma.EntryUncheckedUpdateManyInput = {
      ...(dto.title !== undefined ? { title: dto.title } : {}),
      ...(dto.description !== undefined ? { description: dto.description ?? null } : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
      // completedAt ต้องตามสถานะเสมอ — เปิดงานกลับมาทำ (undo) แล้วยังค้างวันที่เสร็จไว้ สถิติจะเพี้ยน
      ...(dto.status !== undefined ? { completedAt: completedAtFor(dto.status, before) } : {}),
      ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
      ...(occurredAt !== undefined ? { occurredAt } : {}),
      ...(isAllDay !== undefined ? { isAllDay } : {}),
      ...(payload !== undefined ? { payload: payload as Prisma.InputJsonValue } : {}),
      ...(dto.projectId !== undefined ? { projectId: dto.projectId ?? null } : {}),
      version: { increment: 1 },
    };
    return { data, occurredAt };
  }

  private async throwConflict(userId: string, id: string, expected: number): Promise<never> {
    const current = await this.requireEntry(userId, id);
    throw new VersionConflictError(expected, current.version);
  }

  /** รอบนี้ไม่อยู่ที่ slot เดิมแล้ว (เลื่อน/ลบ) → slot เข้า exceptions ของกฎ · entry ปกติไม่ทำอะไร */
  private async detachFromSeries(
    tx: Prisma.TransactionClient,
    userId: string,
    entry: Pick<EntryWithRelations, 'recurrenceRuleId' | 'recurrenceSlot'>,
  ): Promise<void> {
    if (!entry.recurrenceRuleId || !entry.recurrenceSlot) return;
    await this.recurrence.excludeSlot(tx, userId, entry.recurrenceRuleId, entry.recurrenceSlot);
  }

  private async detachManyFromSeries(
    tx: Prisma.TransactionClient,
    userId: string,
    ids: string[],
  ): Promise<void> {
    if (!ids.length) return;
    const recurring = await tx.entry.findMany({
      where: { id: { in: ids }, userId, recurrenceRuleId: { not: null } },
      select: { recurrenceRuleId: true, recurrenceSlot: true },
    });
    for (const entry of recurring) await this.detachFromSeries(tx, userId, entry);
  }

  /** payload ถูก validate ด้วย Zod ของโมดูลนั้น — JSONB ไม่ได้แปลว่า freeform (ADR-003) */
  private validatePayload(moduleKey: string, payload: unknown): Record<string, unknown> {
    const module = this.registry.get(moduleKey as never);
    const result = module.payloadSchema.safeParse(payload ?? {});
    if (!result.success) {
      throw new PayloadValidationError(
        moduleKey,
        result.error.issues.map((issue) => ({
          path: `payload.${issue.path.join('.')}`,
          code: issue.code,
          message: issue.message,
        })),
      );
    }
    return result.data as Record<string, unknown>;
  }

  private buildWhere(query: ListEntriesQuery, timeZone: string): Prisma.EntryWhereInput {
    const where: Prisma.EntryWhereInput = { deletedAt: null };
    const and: Prisma.EntryWhereInput[] = [];

    if (query.module?.length) where.module = { in: query.module };
    if (query.status?.length) where.status = { in: query.status };
    if (query.priority?.length) where.priority = { in: query.priority };
    if (query.projectId) where.projectId = query.projectId;
    if (query.parentId !== undefined) where.parentId = query.parentId || null;
    if (query.tagIds?.length) where.tags = { some: { tagId: { in: query.tagIds } } };
    if (query.q) where.title = { contains: query.q, mode: 'insensitive' };
    if (query.hasReminder) where.reminders = { some: { status: 'scheduled' } };

    if (query.from || query.to) {
      // date ล้วน: from = ต้นวัน · to = รวมทั้งวัน (< ต้นวันถัดไป) ตามโซนผู้ใช้
      const to =
        typeof query.to === 'string'
          ? { lt: dayBoundsInTimeZone(resolveDateInput(query.to, timeZone), timeZone).end }
          : query.to
            ? { lte: query.to }
            : {};
      where.occurredAt = {
        ...(query.from ? { gte: resolveDateInput(query.from, timeZone) } : {}),
        ...to,
      };
    }

    if (query.inbox) {
      where.projectId = null;
      where.occurredAt = null;
    }

    if (query.overdue) {
      const now = new Date();
      and.push(overdueWhere(now, dayBoundsInTimeZone(now, timeZone).start));
    }

    return and.length ? { ...where, AND: and } : where;
  }

  private async requireEntry(userId: string, id: string): Promise<EntryWithRelations> {
    const row = await this.prisma.entry.findFirst({
      where: { id, userId },
      include: INCLUDE_RELATIONS,
    });
    if (!row) throw new EntryNotFoundError(id);
    return row as EntryWithRelations;
  }

  /**
   * แจ้งโมดูลเจ้าของรายการผ่าน hook + ยิง event กลางให้ระบบอื่นฟัง
   * โมดูลไม่คุยกันเอง — สื่อสารผ่าน event bus เท่านั้น (กฎข้อ 3)
   */
  private async emitWrite(
    operation: EntryWriteOperation,
    userId: string,
    row: EntryWithRelations,
    beforeRow: EntryWithRelations | null,
  ): Promise<void> {
    const ctx = await this.userContext.forUser(userId);
    const event: EntryWriteEvent = {
      operation,
      entry: toDomain(row),
      before: beforeRow ? toDomain(beforeRow) : null,
      ctx,
    };
    this.events.emit(ENTRY_WRITE_EVENT, event);
    try {
      await this.registry.get(row.module).onAfterWrite?.(event);
    } catch (err) {
      // hook ของโมดูลพังต้องไม่ทำให้คำขอหลักล้ม
      this.logger.error(`onAfterWrite ของโมดูล ${row.module} ล้มเหลว: ${(err as Error).message}`);
    }
  }
}

async function replaceTags(
  tx: Prisma.TransactionClient,
  entryId: string,
  tagIds: string[],
): Promise<void> {
  await tx.entryTag.deleteMany({ where: { entryId } });
  if (tagIds.length) {
    await tx.entryTag.createMany({ data: tagIds.map((tagId) => ({ entryId, tagId })) });
  }
}
