import {
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  createRecurrenceRuleSchema,
  previewDraftRuleSchema,
  recurrenceTemplateSchema,
  updateRecurrenceRuleSchema,
  type CreateRecurrenceRuleInput,
  type PreviewDraftRuleInput,
  type RecurrencePreviewDto,
  type RecurrenceRuleDto,
  type RecurrenceTemplate,
  type UpdateRecurrenceRuleInput,
} from '@nosion/contracts';
import {
  RecurrenceRuleError,
  isValidTimeZone,
  nextOccurrences,
  occurrencesBetween,
  resolveDateInput,
  slotOnLocalDate,
  toFloating,
  type RecurrenceEnd,
  type RecurrenceSpec,
} from '@nosion/core';
import { Prisma, type RecurrenceRule } from '@prisma/client';
import { ModuleRegistryService } from '../core/registry/module-registry.service';
import { PrismaService } from '../infra/prisma/prisma.service';
import { UserContextService } from '../users/user-context.service';

/** สร้าง entry ล่วงหน้ากี่วัน (สเปก 6.1) */
export const MATERIALIZE_HORIZON_DAYS = 90;
/** cron เติมเฉพาะ rule ที่เหลือล่วงหน้าน้อยกว่านี้ — กันเขียน DB ทุกวันโดยไม่จำเป็น */
export const REFILL_THRESHOLD_DAYS = 60;
/** ปุ่ม "Materialize Recurrence" ใน Today — สร้างล่วงหน้าแค่ 7 วัน (สเปก 7.x) */
export const MANUAL_HORIZON_DAYS = 7;
/** cron ทำทีละกี่ rule ต่อรอบ — งานใหญ่แบ่งเป็นชุด ไม่ค้าง function timeout */
const CRON_BATCH_SIZE = 200;

const DAY_MS = 24 * 60 * 60 * 1000;

/** ส่วนของ template ที่แก้จาก entry ได้ — วันเวลาและสถานะเป็นของแต่ละรอบ ไม่ใช่ของ series */
export type SeriesTemplatePatch = Partial<
  Pick<
    RecurrenceTemplate,
    'title' | 'description' | 'priority' | 'payload' | 'projectId' | 'tagIds'
  >
>;

export interface MaterializeResult {
  ruleId: string;
  created: number;
  materializedUntil: Date;
}

/**
 * Recurrence Engine ฝั่ง API — CRUD ของ rule + lazy materialization
 *
 * หลักการ:
 * - การคำนวณรอบทั้งหมดอยู่ใน @nosion/core (ล้วน ทดสอบได้โดยไม่ต้องมี DB)
 * - การเขียน entry เป็น idempotent ด้วย unique (recurrenceRuleId, recurrenceSlot) + skipDuplicates
 *   → cron ซ้อนกัน 2 ตัว หรือกดปุ่มรัว ๆ ก็ไม่เกิดรายการซ้ำ
 * - entry ที่สร้างแล้วเป็นของผู้ใช้ — แก้ template ของ rule ไม่ย้อนไปแก้ (สเปก 6.1)
 *   ยกเว้น "รอบในอนาคตที่ผู้ใช้ยังไม่แตะเลย" ซึ่งสร้างใหม่ได้เมื่อเปลี่ยนตาราง/หยุด/ลบ rule
 */
@Injectable()
export class RecurrenceService {
  private readonly logger = new Logger(RecurrenceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: ModuleRegistryService,
    private readonly userContext: UserContextService,
  ) {}

  // ── CRUD ─────────────────────────────────────────────

  async list(userId: string): Promise<RecurrenceRuleDto[]> {
    const rows = await this.prisma.forUser(userId).recurrenceRule.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toDto);
  }

  async get(userId: string, id: string): Promise<RecurrenceRuleDto> {
    return toDto(await this.requireRule(userId, id));
  }

  async create(
    userId: string,
    input: CreateRecurrenceRuleInput,
    now = new Date(),
  ): Promise<RecurrenceRuleDto> {
    const dto = createRecurrenceRuleSchema.parse(input);
    const timezone = await this.resolveTimeZone(userId, dto.timezone);
    const template = this.validateTemplate(dto.template);
    const startsAt = resolveDateInput(dto.startsAt, timezone);
    const end = toEnd(
      dto.endType,
      dto.endsAt ? resolveDateInput(dto.endsAt, timezone) : null,
      dto.maxCount ?? null,
    );
    const spec: RecurrenceSpec = {
      rrule: normalizeRrule(dto.rrule),
      startsAt,
      timezone,
      end,
      exceptions: [],
    };
    assertHasOccurrence(spec);

    const row = await this.prisma.recurrenceRule.create({
      data: {
        userId,
        rrule: spec.rrule,
        startsAt,
        timezone,
        endType: dto.endType,
        endsAt: end.type === 'onDate' ? end.endsAt : null,
        maxCount: end.type === 'afterCount' ? end.maxCount : null,
        template: template as Prisma.InputJsonValue,
      },
    });
    // สร้างรอบล่วงหน้าทันที — ผู้ใช้เห็นรายการในหน้า Tasks/Expenses ได้เลยไม่ต้องรอ cron
    const materialized = await this.materialize(row, now);
    return toDto({ ...row, materializedUntil: materialized.materializedUntil });
  }

  async update(
    userId: string,
    id: string,
    input: UpdateRecurrenceRuleInput,
    now = new Date(),
  ): Promise<RecurrenceRuleDto> {
    const dto = updateRecurrenceRuleSchema.parse(input);
    const before = await this.requireRule(userId, id);
    const timezone =
      dto.timezone !== undefined
        ? await this.resolveTimeZone(userId, dto.timezone)
        : before.timezone;
    const startsAt =
      dto.startsAt !== undefined ? resolveDateInput(dto.startsAt, timezone) : before.startsAt;

    const endType = dto.endType ?? before.endType;
    const endsAtRaw = dto.endsAt !== undefined ? dto.endsAt : before.endsAt;
    const endsAt = endsAtRaw ? resolveDateInput(endsAtRaw, timezone) : null;
    const maxCount = dto.maxCount !== undefined ? dto.maxCount : before.maxCount;
    const end = toEnd(endType, endsAt, maxCount);

    const spec: RecurrenceSpec = {
      rrule: dto.rrule !== undefined ? normalizeRrule(dto.rrule) : before.rrule,
      startsAt,
      timezone,
      end,
      exceptions: before.exceptions,
    };
    assertHasOccurrence(spec);
    const template = dto.template !== undefined ? this.validateTemplate(dto.template) : undefined;

    const scheduleChanged =
      spec.rrule !== before.rrule ||
      spec.startsAt.getTime() !== before.startsAt.getTime() ||
      spec.timezone !== before.timezone ||
      endType !== before.endType ||
      (endsAt?.getTime() ?? null) !== (before.endsAt?.getTime() ?? null) ||
      maxCount !== before.maxCount;

    const row = await this.prisma.$transaction(async (tx) => {
      // ตารางเปลี่ยน = รอบในอนาคตที่ยังไม่มีใครแตะไม่ตรงกับตารางใหม่แล้ว → ลบแล้วสร้างใหม่
      if (scheduleChanged) await this.dropUntouchedFuture(tx, userId, id, now);
      return tx.recurrenceRule.update({
        where: { id },
        data: {
          rrule: spec.rrule,
          startsAt,
          timezone,
          endType,
          endsAt: end.type === 'onDate' ? end.endsAt : null,
          maxCount: end.type === 'afterCount' ? end.maxCount : null,
          ...(template ? { template: template as Prisma.InputJsonValue } : {}),
          ...(scheduleChanged ? { materializedUntil: now } : {}),
        },
      });
    });
    if (!row.isPaused && scheduleChanged) {
      const materialized = await this.materialize(row, now);
      return toDto({ ...row, materializedUntil: materialized.materializedUntil });
    }
    return toDto(row);
  }

  /** ลบ rule (soft) — รอบที่ผ่านมาแล้วหรือผู้ใช้แก้ไว้ยังอยู่ รอบในอนาคตที่ยังไม่แตะถูกลบ */
  async remove(userId: string, id: string, now = new Date()): Promise<void> {
    await this.requireRule(userId, id);
    await this.prisma.$transaction((tx) => this.endSeries(tx, userId, id, now));
  }

  /** หยุด/เริ่มต่อ — หยุดแล้วรอบในอนาคตที่ยังไม่แตะหายไป เริ่มต่อแล้วสร้างกลับมาตามปกติ */
  async setPaused(
    userId: string,
    id: string,
    paused: boolean,
    now = new Date(),
  ): Promise<RecurrenceRuleDto> {
    const before = await this.requireRule(userId, id);
    if (before.isPaused === paused) return toDto(before);
    const row = await this.prisma.$transaction(async (tx) => {
      if (paused) await this.dropUntouchedFuture(tx, userId, id, now);
      return tx.recurrenceRule.update({
        where: { id },
        data: { isPaused: paused, ...(paused ? { materializedUntil: now } : {}) },
      });
    });
    if (!paused) {
      const materialized = await this.materialize(row, now);
      return toDto({ ...row, materializedUntil: materialized.materializedUntil });
    }
    return toDto(row);
  }

  /**
   * ลบเฉพาะรอบของวันที่ `ymd` (ตามปฏิทินของ rule) — เพิ่มเข้า exceptions + ลบ entry ของรอบนั้นถ้ามี
   * idempotent: ลบซ้ำได้ผลเท่าเดิม
   */
  async deleteOccurrence(
    userId: string,
    id: string,
    ymd: string,
    now = new Date(),
  ): Promise<RecurrenceRuleDto> {
    const before = await this.requireRule(userId, id);
    let slot: Date | null;
    try {
      slot = slotOnLocalDate(toSpec(before), ymd);
    } catch (err) {
      throw asHttpError(err);
    }
    if (!slot) throw new NotFoundException(`วันที่ ${ymd} ไม่มีรอบของกฎนี้`);

    const already = before.exceptions.some((d) => d.getTime() === slot.getTime());
    const row = await this.prisma.$transaction(async (tx) => {
      await tx.entry.updateMany({
        where: { userId, recurrenceRuleId: id, recurrenceSlot: slot, deletedAt: null },
        data: { deletedAt: now, version: { increment: 1 } },
      });
      return already
        ? before
        : tx.recurrenceRule.update({ where: { id }, data: { exceptions: { push: slot } } });
    });
    return toDto(row);
  }

  // ── จากฝั่ง entry (สเปก 6.1 "แก้ไขรอบเดียว vs ทั้ง series") ──
  // เมธอดที่รับ `tx` ทำงานใน transaction ของ EntriesService — การแก้ entry กับกฎสำเร็จหรือล้มพร้อมกัน

  /**
   * ปลดรอบออกจาก series: เพิ่ม slot เข้า exceptions — ใช้เมื่อผู้ใช้เลื่อนหรือลบ "เฉพาะรอบนี้"
   * กันซ้ำที่ระดับ SQL (`NOT has`) — เรียกซ้ำหรือพร้อมกันก็ไม่เกิด slot ซ้ำใน array
   */
  async excludeSlot(
    tx: Prisma.TransactionClient,
    userId: string,
    ruleId: string,
    slot: Date,
  ): Promise<void> {
    await tx.recurrenceRule.updateMany({
      where: { id: ruleId, userId, NOT: { exceptions: { has: slot } } },
      data: { exceptions: { push: slot } },
    });
  }

  /**
   * template ใหม่ของ series จากส่วนที่ผู้ใช้แก้บน entry — payload ผสานกับของเดิมแล้วตรวจด้วย payloadSchema ของโมดูล
   * เรียกก่อนเปิด transaction เพื่อให้ 404/422 เกิดก่อนเขียนอะไรทั้งนั้น
   */
  async seriesTemplateFor(
    userId: string,
    ruleId: string,
    patch: SeriesTemplatePatch,
  ): Promise<RecurrenceTemplate> {
    const rule = await this.requireRule(userId, ruleId);
    const current = recurrenceTemplateSchema.parse(rule.template);
    const { payload, ...fields } = patch;
    const defined = Object.fromEntries(
      Object.entries(fields).filter(([, value]) => value !== undefined),
    );
    return this.validateTemplate({
      ...current,
      ...defined,
      payload: payload ? { ...current.payload, ...payload } : current.payload,
    });
  }

  /**
   * เปลี่ยน template — รอบอนาคตที่ยังไม่ถูกแตะถูกลบเพื่อสร้างใหม่ตาม template ใหม่
   * (ต่างจาก PATCH /recurrence-rules ที่แก้ template อย่างเดียวแล้วรอให้รอบใหม่ใช้เอง —
   *  ผู้ใช้ที่กด "แก้ทุกรอบ" บนรายการคาดว่าจะเห็นรอบถัดไปเปลี่ยนทันที ไม่ใช่อีก 90 วัน)
   * ต้องเรียก `materializeRule` หลัง commit
   */
  async replaceTemplate(
    tx: Prisma.TransactionClient,
    userId: string,
    ruleId: string,
    template: RecurrenceTemplate,
    now: Date,
  ): Promise<void> {
    await this.dropUntouchedFuture(tx, userId, ruleId, now);
    await tx.recurrenceRule.updateMany({
      where: { id: ruleId, userId, deletedAt: null },
      data: { template: template as Prisma.InputJsonValue, materializedUntil: now },
    });
  }

  /** จบ series (soft delete กฎ) — รอบที่ผ่านแล้วหรือผู้ใช้แตะแล้วยังอยู่ · เรียกซ้ำได้ */
  async endSeries(
    tx: Prisma.TransactionClient,
    userId: string,
    ruleId: string,
    now: Date,
  ): Promise<void> {
    await this.dropUntouchedFuture(tx, userId, ruleId, now);
    await tx.recurrenceRule.updateMany({
      where: { id: ruleId, userId, deletedAt: null },
      data: { deletedAt: now },
    });
  }

  /** materialize กฎตาม id — ใช้หลัง commit ของ replaceTemplate · กฎที่ถูกลบ/หยุดไว้ไม่ทำอะไร */
  async materializeRule(userId: string, ruleId: string, now = new Date()): Promise<void> {
    const rule = await this.prisma
      .forUser(userId)
      .recurrenceRule.findFirst({ where: { id: ruleId, deletedAt: null } });
    if (rule) await this.materialize(rule, now);
  }

  // ── Preview ──────────────────────────────────────────

  async preview(
    userId: string,
    id: string,
    limit = 10,
    now = new Date(),
  ): Promise<RecurrencePreviewDto> {
    const row = await this.requireRule(userId, id);
    return previewOf(toSpec(row), now, limit);
  }

  /** preview กฎที่ยังไม่บันทึก — ใช้กับตัวสร้าง rrule ในหน้าเว็บ */
  async previewDraft(
    userId: string,
    input: PreviewDraftRuleInput,
    now = new Date(),
  ): Promise<RecurrencePreviewDto> {
    const dto = previewDraftRuleSchema.parse(input);
    const timezone = await this.resolveTimeZone(userId, dto.timezone);
    const startsAt = resolveDateInput(dto.startsAt, timezone);
    const end = toEnd(
      dto.endType,
      dto.endsAt ? resolveDateInput(dto.endsAt, timezone) : null,
      dto.maxCount ?? null,
    );
    const spec: RecurrenceSpec = { rrule: normalizeRrule(dto.rrule), startsAt, timezone, end };
    // preview ของกฎที่เริ่มในอนาคต ต้องแสดงตั้งแต่รอบแรก ไม่ใช่หลัง "ตอนนี้"
    const after = new Date(Math.min(now.getTime(), startsAt.getTime() - 1));
    return previewOf(spec, after, dto.limit);
  }

  // ── Materialization ──────────────────────────────────

  /**
   * สร้าง entry ของรอบที่อยู่ในช่วง (materializedUntil, now + horizon] — สเปก 6.1
   *
   * - ต่อจากจุดที่ค้างไว้ ไม่เริ่มใหม่ทุกครั้ง · ครบแล้วไม่เขียน DB
   * - createMany + skipDuplicates บน unique (recurrenceRuleId, recurrenceSlot) → idempotent แม้รันซ้อนกัน
   * - materializedUntil เลื่อนไปข้างหน้าเท่านั้น — ตัวที่ช้ากว่าไม่ดึงค่ากลับ
   */
  async materialize(
    rule: RecurrenceRule,
    now: Date,
    horizonDays = MATERIALIZE_HORIZON_DAYS,
  ): Promise<MaterializeResult> {
    const horizon = new Date(now.getTime() + horizonDays * DAY_MS);
    const from = rule.materializedUntil;
    if (rule.isPaused || rule.deletedAt || (from && from.getTime() >= horizon.getTime())) {
      return { ruleId: rule.id, created: 0, materializedUntil: from ?? now };
    }

    let template: RecurrenceTemplate;
    try {
      template = recurrenceTemplateSchema.parse(rule.template);
    } catch {
      // template เสียหาย (เช่นแก้ DB ตรง ๆ) — ข้าม rule นี้ ไม่ให้ทั้ง cron ล้ม
      this.logger.error({ ruleId: rule.id }, 'template ของ recurrence rule ไม่ถูกต้อง — ข้าม');
      return { ruleId: rule.id, created: 0, materializedUntil: from ?? now };
    }

    // ไม่ย้อนสร้างรอบในอดีต: rule ที่เพิ่งสร้างเริ่มจากรอบแรก แต่ข้ามรอบที่เลย "เมื่อวาน" ไปแล้ว
    // (บิลที่ตั้งย้อนหลังไม่ควรโผล่เป็นรายการค้างจ่ายย้อนหลังหลายเดือน)
    const notBefore = new Date(now.getTime() - DAY_MS);
    const after = from ?? (rule.startsAt.getTime() < notBefore.getTime() ? notBefore : null);
    const slots = occurrencesBetween(toSpec(rule), after, horizon);

    const created = await this.prisma.$transaction(async (tx) => {
      const result = slots.length
        ? await tx.entry.createMany({
            data: slots.map((slot) => entryDataFor(rule, template, slot)),
            skipDuplicates: true, // ← หัวใจของ idempotency
          })
        : { count: 0 };
      if (template.tagIds.length && result.count > 0) {
        const rows = await tx.entry.findMany({
          where: { recurrenceRuleId: rule.id, recurrenceSlot: { in: slots } },
          select: { id: true },
        });
        await tx.entryTag.createMany({
          data: rows.flatMap((r) => template.tagIds.map((tagId) => ({ entryId: r.id, tagId }))),
          skipDuplicates: true,
        });
      }
      // เลื่อนไปข้างหน้าเท่านั้น — ตัวที่ช้ากว่า (horizon น้อยกว่า) ไม่ดึงค่ากลับ
      await tx.recurrenceRule.updateMany({
        where: {
          id: rule.id,
          OR: [{ materializedUntil: null }, { materializedUntil: { lt: horizon } }],
        },
        data: { materializedUntil: horizon },
      });
      return result.count;
    });

    return { ruleId: rule.id, created, materializedUntil: horizon };
  }

  /** ปุ่ม "Materialize Recurrence" — ทุก rule ของผู้ใช้คนนี้ 7 วันข้างหน้า (idempotent) */
  async materializeForUser(
    userId: string,
    now = new Date(),
  ): Promise<{ rules: number; created: number }> {
    const rules = await this.prisma.forUser(userId).recurrenceRule.findMany({
      where: { deletedAt: null, isPaused: false },
    });
    let created = 0;
    for (const rule of rules) {
      created += (await this.materialize(rule, now, MANUAL_HORIZON_DAYS)).created;
    }
    return { rules: rules.length, created };
  }

  /**
   * งาน cron รายวัน (03:00 UTC) — เติม rule ที่สร้างล่วงหน้าเหลือน้อยกว่า 60 วัน
   * แบ่งเป็นชุดตาม id เพื่อไม่โหลดทุก rule เข้าหน่วยความจำพร้อมกัน
   */
  async materializeDue(
    now = new Date(),
  ): Promise<{ rules: number; created: number; failed: number }> {
    const threshold = new Date(now.getTime() + REFILL_THRESHOLD_DAYS * DAY_MS);
    let cursor: string | undefined;
    let rules = 0;
    let created = 0;
    let failed = 0;
    for (;;) {
      const batch = await this.prisma.recurrenceRule.findMany({
        where: {
          deletedAt: null,
          isPaused: false,
          OR: [{ materializedUntil: null }, { materializedUntil: { lt: threshold } }],
        },
        orderBy: { id: 'asc' },
        take: CRON_BATCH_SIZE,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      });
      if (batch.length === 0) break;
      for (const rule of batch) {
        try {
          created += (await this.materialize(rule, now)).created;
          rules += 1;
        } catch (err) {
          // rule เดียวพังไม่ควรหยุด rule ของผู้ใช้คนอื่น
          failed += 1;
          this.logger.error({ ruleId: rule.id, err }, 'materialize ล้มเหลว');
        }
      }
      cursor = batch[batch.length - 1]!.id;
      if (batch.length < CRON_BATCH_SIZE) break;
    }
    this.logger.log({ rules, created, failed }, 'materialize recurrence (cron)');
    return { rules, created, failed };
  }

  // ── helpers ──────────────────────────────────────────

  private async requireRule(userId: string, id: string): Promise<RecurrenceRule> {
    const row = await this.prisma
      .forUser(userId)
      .recurrenceRule.findFirst({ where: { id, deletedAt: null } });
    if (!row) throw new NotFoundException('ไม่พบกฎการเกิดซ้ำ');
    return row;
  }

  private async resolveTimeZone(userId: string, requested: string | undefined): Promise<string> {
    if (requested !== undefined) {
      if (!isValidTimeZone(requested))
        throw new UnprocessableEntityException(`timezone ไม่ถูกต้อง: ${requested}`);
      return requested;
    }
    return (await this.userContext.forUser(userId)).timezone;
  }

  /** template ต้องผ่าน payloadSchema ของโมดูลเหมือน entry ปกติ — ตรวจตอนบันทึก ไม่ใช่ตอน cron */
  private validateTemplate(template: RecurrenceTemplate): RecurrenceTemplate {
    const module = this.registry.get(template.module);
    const payload = module.payloadSchema.safeParse(template.payload ?? {});
    if (!payload.success) {
      throw new UnprocessableEntityException({
        message: 'payload ของ template ไม่ถูกต้อง',
        errors: payload.error.issues.map((i) => ({
          path: ['template', 'payload', ...i.path],
          message: i.message,
        })),
      });
    }
    return { ...template, payload: payload.data as Record<string, unknown> };
  }

  /** รอบในอนาคตที่ยัง pending และไม่เคยถูกแก้ (version 1) — ลบจริงเพื่อคืน unique slot ให้สร้างใหม่ได้ */
  private async dropUntouchedFuture(
    tx: Prisma.TransactionClient,
    userId: string,
    ruleId: string,
    now: Date,
  ) {
    await tx.entry.deleteMany({
      where: {
        userId,
        recurrenceRuleId: ruleId,
        recurrenceSlot: { gt: now },
        status: 'pending',
        version: 1,
        deletedAt: null,
      },
    });
  }
}

// ── pure helpers (export ไว้ให้ unit test) ─────────────

export function normalizeRrule(rrule: string): string {
  return rrule
    .trim()
    .replace(/^RRULE:/i, '')
    .toUpperCase();
}

export function toEnd(type: string, endsAt: Date | null, maxCount: number | null): RecurrenceEnd {
  if (type === 'onDate') {
    if (!endsAt) throw new UnprocessableEntityException('endType=onDate ต้องระบุ endsAt');
    return { type: 'onDate', endsAt };
  }
  if (type === 'afterCount') {
    if (!maxCount) throw new UnprocessableEntityException('endType=afterCount ต้องระบุ maxCount');
    return { type: 'afterCount', maxCount };
  }
  return { type: 'never' };
}

export function toSpec(row: RecurrenceRule): RecurrenceSpec {
  return {
    rrule: row.rrule,
    startsAt: row.startsAt,
    timezone: row.timezone,
    end: toEnd(row.endType, row.endsAt, row.maxCount),
    exceptions: row.exceptions,
  };
}

/** แปลง error ของ engine เป็น 422 พร้อมข้อความเดิม — อย่างอื่นโยนต่อ */
export function asHttpError(err: unknown): unknown {
  return err instanceof RecurrenceRuleError ? new UnprocessableEntityException(err.message) : err;
}

function assertHasOccurrence(spec: RecurrenceSpec): void {
  let first: Date[];
  try {
    first = nextOccurrences(spec, new Date(spec.startsAt.getTime() - 1), 1);
  } catch (err) {
    throw asHttpError(err);
  }
  if (first.length === 0) throw new UnprocessableEntityException('กฎนี้ไม่มีรอบที่เกิดขึ้นจริงเลย');
}

function previewOf(spec: RecurrenceSpec, after: Date, limit: number): RecurrencePreviewDto {
  let occurrences: Date[];
  try {
    occurrences = nextOccurrences(spec, after, limit);
  } catch (err) {
    throw asHttpError(err);
  }
  return {
    timezone: spec.timezone,
    occurrences: occurrences.map((d) => d.toISOString()),
    localDates: occurrences.map((d) => toFloating(d, spec.timezone).toISOString().slice(0, 10)),
  };
}

export function entryDataFor(
  rule: Pick<RecurrenceRule, 'id' | 'userId'>,
  template: RecurrenceTemplate,
  slot: Date,
): Prisma.EntryCreateManyInput {
  return {
    userId: rule.userId,
    module: template.module,
    title: template.title,
    description: template.description ?? null,
    priority: template.priority,
    status: 'pending',
    isAllDay: template.isAllDay,
    payload: template.payload as Prisma.InputJsonValue,
    projectId: template.projectId ?? null,
    recurrenceRuleId: rule.id,
    recurrenceSlot: slot,
    occurredAt: slot,
  };
}

function toDto(row: RecurrenceRule): RecurrenceRuleDto {
  return {
    id: row.id,
    rrule: row.rrule,
    startsAt: row.startsAt.toISOString(),
    timezone: row.timezone,
    endType: row.endType,
    endsAt: row.endsAt?.toISOString() ?? null,
    maxCount: row.maxCount,
    exceptions: row.exceptions.map((d) => d.toISOString()),
    template: row.template as unknown as RecurrenceTemplate,
    isPaused: row.isPaused,
    materializedUntil: row.materializedUntil?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
