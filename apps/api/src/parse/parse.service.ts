import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import {
  createProjectSchema,
  createTagSchema,
  type ParseCommitDto,
  type ParseCommitInput,
  type ParsedEntryDto,
  type ParseResultDto,
} from '@nosion/contracts';
import type { ParsedEntry } from '@nosion/core';
import { ParserService } from '../core/parser/parser.service';
import { PrismaService } from '../infra/prisma/prisma.service';
import { ProjectsService } from '../organization/projects.service';
import { TagsService } from '../organization/tags.service';
import { RecurrenceService } from '../recurrence/recurrence.service';
import { UserContextService } from '../users/user-context.service';
import { EntriesService } from '../entries/entries.service';

/** เทียบชื่อแบบไม่สนตัวพิมพ์และถือว่า "-" = ช่องว่าง — "+auth-v2" ตรงกับโปรเจกต์ "Auth v2" (เหมือน quick capture) */
function sameName(a: string, b: string): boolean {
  const norm = (s: string) =>
    s
      .trim()
      .toLowerCase()
      .replace(/[\s_-]+/g, ' ');
  return norm(a) === norm(b);
}

function toDto(p: ParsedEntry): ParsedEntryDto {
  return {
    module: p.module,
    title: p.title,
    occurredAt: p.occurredAt?.toISOString() ?? null,
    isAllDay: p.isAllDay,
    priority: p.priority ?? 'none',
    status: p.status ?? 'pending',
    payload: p.payload,
    rrule: p.rrule ?? null,
    reminders: p.reminders ?? [],
    confidence: p.confidence,
    matchedTokens: p.matchedTokens ?? [],
  };
}

/**
 * `/parse` (preview) และ `/parse/commit` (บันทึก) — ชั้น persistence ของ NL Parser
 * commit **parse ใหม่ที่ server เสมอ** ไม่รับ payload จาก client → preview กับของที่บันทึกมาจากกฎชุดเดียวกัน
 */
@Injectable()
export class ParseService {
  constructor(
    private readonly parser: ParserService,
    private readonly userContext: UserContextService,
    private readonly entries: EntriesService,
    private readonly recurrence: RecurrenceService,
    private readonly tags: TagsService,
    private readonly projects: ProjectsService,
    private readonly prisma: PrismaService,
  ) {}

  async preview(userId: string, text: string, now = new Date()): Promise<ParseResultDto> {
    const ctx = await this.userContext.forUser(userId, now);
    const { text: nl, best, alternatives } = this.parser.parse(text, ctx);
    return {
      best: best ? toDto(best) : null,
      alternatives: alternatives.map(toDto),
      tags: nl.tags,
      project: nl.project,
      tokens: nl.tokens.map(({ kind, raw, start, end }) => ({ kind, raw, start, end })),
    };
  }

  async commit(userId: string, input: ParseCommitInput, now = new Date()): Promise<ParseCommitDto> {
    const ctx = await this.userContext.forUser(userId, now);
    const { text: nl, best, alternatives } = this.parser.parse(input.text, ctx);
    const chosen = input.module
      ? [best, ...alternatives].find((c) => c?.module === input.module)
      : best;
    if (!chosen) {
      throw new UnprocessableEntityException(
        input.module
          ? `ข้อความนี้สร้างเป็น ${input.module} ไม่ได้`
          : 'ไม่เข้าใจข้อความนี้ — ลองใส่ชื่อรายการ',
      );
    }

    const [projectId, tagIds] = await Promise.all([
      this.resolveProject(userId, nl.project),
      this.resolveTags(userId, nl.tags),
    ]);
    const fields = {
      module: chosen.module,
      title: chosen.title,
      description: input.description?.trim() || null,
      priority: chosen.priority ?? 'none',
      isAllDay: chosen.isAllDay,
      payload: { ...chosen.payload, ...input.payloadPatch },
      projectId,
      tagIds,
      reminders: chosen.reminders ?? [],
    };

    if (!chosen.rrule) {
      const entry = await this.entries.create(userId, {
        ...fields,
        status: chosen.status ?? 'pending',
        occurredAt: chosen.occurredAt,
        clientId: input.clientId,
      });
      return { entry, rule: null };
    }

    // กฎ + สร้างรอบล่วงหน้าทันที (รวมการเตือนของทุกรอบจาก template) — รอบแรกคือ occurredAt ที่ parser คำนวณ
    const rule = await this.recurrence.create(
      userId,
      { rrule: chosen.rrule, startsAt: chosen.occurredAt ?? now, template: fields },
      now,
    );
    const first = await this.prisma.forUser(userId).entry.findFirst({
      where: { recurrenceRuleId: rule.id, deletedAt: null },
      orderBy: { occurredAt: 'asc' },
      select: { id: true },
    });
    if (!first) throw new UnprocessableEntityException('กฎนี้ไม่มีรอบในช่วงที่สร้างล่วงหน้า');
    return { entry: await this.entries.findOne(userId, first.id), rule };
  }

  private async resolveProject(userId: string, name: string | null): Promise<string | null> {
    if (!name) return null;
    const existing = (await this.projects.list(userId)).find((p) => sameName(p.name, name));
    if (existing) return existing.id;
    return (await this.projects.create(userId, createProjectSchema.parse({ name }))).id;
  }

  private async resolveTags(userId: string, names: string[]): Promise<string[]> {
    if (names.length === 0) return [];
    const all = await this.tags.list(userId);
    const ids: string[] = [];
    for (const name of names) {
      const existing = all.find((t) => sameName(t.name, name));
      ids.push(
        existing?.id ?? (await this.tags.create(userId, createTagSchema.parse({ name }))).id,
      );
    }
    return [...new Set(ids)];
  }
}
