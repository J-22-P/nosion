import { HttpException, Injectable, Logger } from '@nestjs/common';
import {
  syncPushSchema,
  type EntryDto,
  type SyncEditableFields,
  type SyncOperation,
  type SyncPullDto,
  type SyncPullQuery,
  type SyncPushDto,
  type SyncPushInput,
  type SyncResult,
  type SyncTarget,
} from '@nosion/contracts';
import { EntryNotFoundError } from '@nosion/core';
import { Prisma, type Entry } from '@prisma/client';
import { EntriesService } from '../entries/entries.service';
import { toDto, type EntryWithRelations } from '../entries/entry.mapper';
import { PrismaService } from '../infra/prisma/prisma.service';
import { ParseService } from '../parse/parse.service';
import { mergeFields } from './merge';

/** ดึงซ้ำย้อนหลังเท่านี้ทุกครั้ง — updatedAt มาจากนาฬิกาของ server หลายเครื่อง + transaction ที่ commit ช้า */
const PULL_OVERLAP_MS = 2 * 60 * 1000;
/** ผลของ operation เก็บไว้กี่วัน (outbox ที่ค้างนานกว่านี้ส่งซ้ำแล้วจะถูกทำใหม่) */
const SYNC_OP_RETENTION_DAYS = 30;
const INCLUDE = { tags: { include: { tag: true } } } as const;

/**
 * POST /sync/push · GET /sync/pull (สเปก 7.4 · 8.6 · Phase 7)
 * ไม่มีตรรกะของรายการซ้ำที่นี่ — ทุก operation เรียก EntriesService / ParseService ตัวเดียวกับ endpoint ปกติ
 * (validation, การเตือน, กฎการเกิดซ้ำ, event ทำงานเหมือนออนไลน์ทุกอย่าง) · ที่นี่เพิ่มแค่ idempotency + การตัดสิน conflict
 */
@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly entries: EntriesService,
    private readonly parse: ParseService,
  ) {}

  async push(userId: string, input: SyncPushInput, now = new Date()): Promise<SyncPushDto> {
    const { operations } = syncPushSchema.parse(input);
    const results: SyncResult[] = [];
    // ตามลำดับเสมอ — operation หลังอ้างรายการที่ operation ก่อนหน้าสร้าง (clientId) ได้
    for (const op of operations) results.push(await this.once(userId, op));

    await this.prisma.syncOp.deleteMany({
      where: {
        userId,
        createdAt: { lt: new Date(now.getTime() - SYNC_OP_RETENTION_DAYS * 86_400_000) },
      },
    });
    return { results, serverTime: now.toISOString() };
  }

  /** ประมวลผล operation ครั้งเดียวต่อ opId — ส่งซ้ำได้ผลเดิม (เลื่อนวันไม่ซ้ำสอง · กฎไม่ถูกสร้างซ้ำ) */
  private async once(userId: string, op: SyncOperation): Promise<SyncResult> {
    const seen = await this.prisma.syncOp.findUnique({
      where: { userId_opId: { userId, opId: op.opId } },
    });
    if (seen) return { ...(seen.result as unknown as SyncResult), replayed: true };

    let result: SyncResult;
    try {
      result = await this.apply(userId, op);
    } catch (err) {
      result = { opId: op.opId, status: 'error', error: messageOf(err) };
      if (!(err instanceof HttpException) && !(err instanceof EntryNotFoundError)) {
        this.logger.error({ opId: op.opId, op: op.op, err: String(err) }, 'sync operation ล้ม');
      }
    }
    try {
      await this.prisma.syncOp.create({
        data: { userId, opId: op.opId, result: result as unknown as Prisma.InputJsonValue },
      });
    } catch (err) {
      // ชุดเดียวกันถูกส่งพร้อมกันสองครั้ง (Background Sync + แท็บ) — ตัวที่สองบันทึกไม่ได้เพราะ unique ก็ไม่เป็นไร
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) throw err;
    }
    return result;
  }

  private async apply(userId: string, op: SyncOperation): Promise<SyncResult> {
    const ok = (entry: EntryDto, extra: Partial<SyncResult> = {}): SyncResult => ({
      opId: op.opId,
      status: 'applied',
      entry,
      ...extra,
    });

    switch (op.op) {
      case 'create': {
        const entry = await this.entries.create(userId, op.data);
        return ok(entry, { clientId: op.data.clientId });
      }
      case 'parse': {
        const { entry } = await this.parse.commit(userId, {
          text: op.text,
          module: op.module,
          clientId: op.clientId,
          payloadPatch: op.payloadPatch,
        });
        return ok(entry, { clientId: op.clientId });
      }
      case 'delete': {
        const row = await this.resolve(userId, op.target);
        // ลบชนะ: ลบแล้วก็ถือว่าสำเร็จ (ลบซ้ำจากสองเครื่องไม่ใช่ error)
        if (!row.deletedAt) await this.entries.remove(userId, row.id);
        return { opId: op.opId, status: 'applied' };
      }
      case 'restore': {
        const row = await this.resolve(userId, op.target);
        return ok(
          row.deletedAt
            ? await this.entries.restore(userId, row.id)
            : await this.entries.findOne(userId, row.id),
        );
      }
      case 'complete': {
        const row = await this.resolve(userId, op.target);
        if (row.deletedAt) return { opId: op.opId, status: 'deleted' };
        // complete จากสองเครื่อง = idempotent (สเปก 7.4)
        if (row.status === 'done') return ok(await this.entries.findOne(userId, row.id));
        return ok(await this.entries.complete(userId, row.id));
      }
      case 'defer': {
        const row = await this.resolve(userId, op.target);
        if (row.deletedAt) return { opId: op.opId, status: 'deleted' };
        return ok(await this.entries.defer(userId, row.id, op.to));
      }
      case 'update':
        return this.update(userId, op);
    }
  }

  /** แก้ field — ตัดสินทีละ field เทียบกับค่าก่อนแก้ของ client (merge.ts) · ชนกับคนที่เขียนระหว่างอ่าน→เขียน = ลองใหม่ 1 ครั้ง */
  private async update(
    userId: string,
    op: Extract<SyncOperation, { op: 'update' }>,
  ): Promise<SyncResult> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const row = await this.resolve(userId, op.target);
      if (row.deletedAt) return { opId: op.opId, status: 'deleted' }; // ลบ vs แก้ → ลบชนะ

      const { apply, conflicts } = mergeFields(serverFields(row), op.data, op.base);
      const changedOnServer = op.version !== undefined && op.version !== row.version;
      if (Object.keys(apply).length === 0) {
        return {
          opId: op.opId,
          status: conflicts.length ? 'conflict' : 'applied',
          entry: await this.entries.findOne(userId, row.id),
          ...(conflicts.length ? { conflicts } : {}),
        };
      }
      try {
        const entry = await this.entries.update(userId, row.id, { ...apply, version: row.version });
        return {
          opId: op.opId,
          status: conflicts.length ? 'conflict' : changedOnServer ? 'merged' : 'applied',
          entry,
          ...(conflicts.length ? { conflicts } : {}),
        };
      } catch (err) {
        if (err instanceof HttpException && err.getStatus() === 409 && attempt === 0) continue;
        throw err;
      }
    }
    throw new Error('unreachable');
  }

  private async resolve(userId: string, target: SyncTarget): Promise<Entry> {
    const where = target.id ? { id: target.id } : { clientId: target.clientId };
    const row = await this.prisma.forUser(userId).entry.findFirst({ where });
    if (!row) throw new EntryNotFoundError(target.id ?? `clientId:${target.clientId}`);
    return row;
  }

  /**
   * GET /sync/pull — รายการที่เปลี่ยนตั้งแต่ `since` (รวมที่ถูกลบ = tombstone มี deletedAt) เรียงตามเวลาแก้
   * ดึงซ้อนย้อนหลัง 2 นาทีทุกครั้ง (client ตัดซ้ำด้วย id + version) — กันพลาดรายการที่ commit ช้ากว่าเวลาที่บันทึก
   */
  async pull(userId: string, query: SyncPullQuery, now = new Date()): Promise<SyncPullDto> {
    const since = query.since ? new Date(Date.parse(query.since) - PULL_OVERLAP_MS) : undefined;
    const rows = await this.prisma.forUser(userId).entry.findMany({
      where: since ? { updatedAt: { gt: since } } : {},
      include: INCLUDE,
      orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
      take: query.limit + 1,
    });
    const hasMore = rows.length > query.limit;
    const page = (hasMore ? rows.slice(0, query.limit) : rows) as EntryWithRelations[];
    return {
      entries: page.map(toDto),
      cursor: page.at(-1)?.updatedAt.toISOString() ?? query.since ?? now.toISOString(),
      hasMore,
      serverTime: now.toISOString(),
    };
  }
}

function serverFields(row: Entry): SyncEditableFields {
  return {
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    occurredAt: row.occurredAt?.toISOString() ?? null,
    isAllDay: row.isAllDay,
    projectId: row.projectId,
    payload: (row.payload ?? {}) as Record<string, unknown>,
  };
}

function messageOf(err: unknown): string {
  if (err instanceof HttpException) {
    const res = err.getResponse();
    if (typeof res === 'object' && res && 'message' in res) {
      const m = (res as { message: unknown }).message;
      return Array.isArray(m) ? m.join(', ') : String(m);
    }
    return err.message;
  }
  if (err instanceof EntryNotFoundError) return 'ไม่พบรายการ — อาจถูกลบถาวรแล้ว';
  return 'ประมวลผลไม่สำเร็จ';
}
