import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  type BulkActionInput,
  type CreateEntryInput,
  type EntryDto,
  type ListEntriesQuery,
  type Paginated,
  type UpdateEntryInput,
  createEntrySchema,
  updateEntrySchema,
} from '@nosion/contracts';
import {
  EntryNotFoundError,
  PayloadValidationError,
  VersionConflictError,
  type EntryWriteEvent,
  type EntryWriteOperation,
} from '@nosion/core';
import { EntryStatus, Prisma } from '@prisma/client';
import { ModuleRegistryService } from '../core/registry/module-registry.service';
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
  ) {}

  // ── อ่าน ─────────────────────────────────────────────

  async list(userId: string, query: ListEntriesQuery): Promise<Paginated<EntryDto>> {
    const db = this.prisma.forUser(userId);
    const where = this.buildWhere(query);
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
    const module = this.registry.get(dto.module);
    const payload = this.validatePayload(dto.module, dto.payload);

    if (dto.clientId) {
      // idempotent: offline client ยิงซ้ำได้โดยไม่เกิดรายการซ้ำ
      const existing = await this.prisma
        .forUser(userId)
        .entry.findFirst({ where: { clientId: dto.clientId }, include: INCLUDE_RELATIONS });
      if (existing) return toDto(existing as EntryWithRelations);
    }

    const reminders =
      module.supportsReminder && dto.occurredAt
        ? dto.reminders.map((r) => ({
            channel: r.channel,
            offsetMinutes: r.offsetMinutes,
            fireAt: new Date(dto.occurredAt!.getTime() + r.offsetMinutes * 60_000),
            idempotencyKey: `${dto.clientId ?? crypto.randomUUID()}:${r.channel}:${r.offsetMinutes}`,
          }))
        : [];

    const row = await this.prisma.entry.create({
      data: {
        userId,
        module: dto.module,
        title: dto.title,
        description: dto.description ?? null,
        status: dto.status,
        priority: dto.priority,
        occurredAt: dto.occurredAt ?? null,
        isAllDay: dto.isAllDay,
        payload: payload as Prisma.InputJsonValue,
        projectId: dto.projectId ?? null,
        parentId: dto.parentId ?? null,
        clientId: dto.clientId ?? null,
        ...(dto.tagIds.length ? { tags: { create: dto.tagIds.map((tagId) => ({ tagId })) } } : {}),
        ...(reminders.length ? { reminders: { create: reminders } } : {}),
      },
      include: INCLUDE_RELATIONS,
    });

    await this.emitWrite('create', userId, row as EntryWithRelations, null);
    return toDto(row as EntryWithRelations);
  }

  async update(userId: string, id: string, input: UpdateEntryInput): Promise<EntryDto> {
    const dto = updateEntrySchema.parse(input);
    const before = await this.requireEntry(userId, id);

    const payload =
      dto.payload !== undefined
        ? this.validatePayload(before.module, { ...(before.payload as object), ...dto.payload })
        : undefined;

    const data: Prisma.EntryUpdateInput = {
      ...(dto.title !== undefined ? { title: dto.title } : {}),
      ...(dto.description !== undefined ? { description: dto.description ?? null } : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
      ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
      ...(dto.occurredAt !== undefined ? { occurredAt: dto.occurredAt ?? null } : {}),
      ...(dto.isAllDay !== undefined ? { isAllDay: dto.isAllDay } : {}),
      ...(payload !== undefined ? { payload: payload as Prisma.InputJsonValue } : {}),
      ...(dto.projectId !== undefined
        ? { project: dto.projectId ? { connect: { id: dto.projectId } } : { disconnect: true } }
        : {}),
      version: { increment: 1 },
    };

    // optimistic concurrency: แพ้แล้วไม่เขียนทับ — บอก client ให้ merge เอง
    const updated = await this.prisma.entry.updateMany({
      where: { id, userId, version: dto.version, deletedAt: null },
      data: data as Prisma.EntryUpdateManyMutationInput,
    });

    if (updated.count === 0) {
      const current = await this.requireEntry(userId, id);
      throw new VersionConflictError(dto.version, current.version);
    }

    if (dto.tagIds !== undefined) {
      await this.prisma.$transaction([
        this.prisma.entryTag.deleteMany({ where: { entryId: id } }),
        ...(dto.tagIds.length
          ? [
              this.prisma.entryTag.createMany({
                data: dto.tagIds.map((tagId) => ({ entryId: id, tagId })),
              }),
            ]
          : []),
      ]);
    }

    const after = await this.requireEntry(userId, id);
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
    const target = resolveDeferTarget(to, before.occurredAt ?? new Date());
    const payload = { ...(before.payload as Record<string, unknown>) };
    if (typeof payload.deferCount === 'number') payload.deferCount += 1;

    await this.prisma.entry.updateMany({
      where: { id, userId, deletedAt: null },
      data: {
        occurredAt: target,
        payload: payload as Prisma.InputJsonValue,
        version: { increment: 1 },
      },
    });
    const after = await this.requireEntry(userId, id);
    await this.emitWrite('update', userId, after, before);
    return toDto(after);
  }

  async remove(userId: string, id: string): Promise<void> {
    const before = await this.requireEntry(userId, id);
    await this.prisma.entry.updateMany({
      where: { id, userId, deletedAt: null },
      data: { deletedAt: new Date(), version: { increment: 1 } },
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
      case 'delete': {
        const res = await this.prisma.entry.updateMany({
          where,
          data: { deletedAt: new Date(), version: { increment: 1 } },
        });
        return { affected: res.count };
      }
      case 'defer': {
        const target = resolveDeferTarget(input.to ?? 'tomorrow', new Date());
        const res = await this.prisma.entry.updateMany({
          where,
          data: { occurredAt: target, version: { increment: 1 } },
        });
        return { affected: res.count };
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

  private buildWhere(query: ListEntriesQuery): Prisma.EntryWhereInput {
    const where: Prisma.EntryWhereInput = { deletedAt: null };

    if (query.module?.length) where.module = { in: query.module };
    if (query.status?.length) where.status = { in: query.status };
    if (query.priority?.length) where.priority = { in: query.priority };
    if (query.projectId) where.projectId = query.projectId;
    if (query.parentId !== undefined) where.parentId = query.parentId || null;
    if (query.tagIds?.length) where.tags = { some: { tagId: { in: query.tagIds } } };
    if (query.q) where.title = { contains: query.q, mode: 'insensitive' };
    if (query.hasReminder) where.reminders = { some: { status: 'scheduled' } };

    if (query.from || query.to) {
      where.occurredAt = {
        ...(query.from ? { gte: query.from } : {}),
        ...(query.to ? { lte: query.to } : {}),
      };
    }

    if (query.overdue) {
      where.occurredAt = { ...(where.occurredAt as object), lt: new Date() };
      where.status = { in: [EntryStatus.pending, EntryStatus.active] };
    }

    return where;
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
