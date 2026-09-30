import { Injectable } from '@nestjs/common';
import type { TaskSidebarDto } from '@nosion/contracts';
import { EntryStatus, ModuleKey, type Prisma } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { UserContextService } from '../../users/user-context.service';
import { taskRanges } from './task-ranges';

const OPEN_STATUSES = [EntryStatus.pending, EntryStatus.active];
const TOP_TAGS = 6;

/**
 * ตัวเลขสรุปของหน้า Tasks — อ่านอย่างเดียว
 *
 * ทุก query ใส่ userId เองเสมอ แม้ PrismaService.forUser จะเติมให้ก็ตาม
 * เพราะ groupBy ไม่อยู่ในรายการ operation ที่ extension ดักไว้ (ถ้าพึ่ง extension อย่างเดียวจะรั่ว)
 */
@Injectable()
export class TaskStatsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly userContext: UserContextService,
  ) {}

  async sidebar(userId: string, now: Date = new Date()): Promise<TaskSidebarDto> {
    const ctx = await this.userContext.forUser(userId, now);
    const r = taskRanges(now, ctx.timezone);

    const open: Prisma.EntryWhereInput = {
      userId,
      module: ModuleKey.task,
      deletedAt: null,
      status: { in: OPEN_STATUSES },
    };

    const [all, inbox, today, week, overdue, perProject, projects, perTag] = await Promise.all([
      this.prisma.entry.count({ where: open }),
      this.prisma.entry.count({ where: { ...open, projectId: null, occurredAt: null } }),
      this.prisma.entry.count({ where: { ...open, occurredAt: { lt: r.todayEnd } } }),
      this.prisma.entry.count({
        where: { ...open, occurredAt: { gte: r.todayStart, lt: r.weekEnd } },
      }),
      this.prisma.entry.count({ where: { ...open, occurredAt: { lt: now } } }),
      this.prisma.entry.groupBy({
        by: ['projectId'],
        where: { ...open, projectId: { not: null } },
        _count: { _all: true },
      }),
      this.prisma.project.findMany({
        where: { userId, isArchived: false, deletedAt: null },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        select: { id: true, name: true, color: true },
      }),
      this.prisma.entryTag.groupBy({
        by: ['tagId'],
        where: { entry: open },
        _count: { tagId: true },
        orderBy: { _count: { tagId: 'desc' } },
        take: TOP_TAGS,
      }),
    ]);

    const tags = perTag.length
      ? await this.prisma.tag.findMany({
          where: { userId, id: { in: perTag.map((t) => t.tagId) } },
          select: { id: true, name: true },
        })
      : [];

    return buildSidebar({
      counts: { all, inbox, today, week, overdue },
      projects,
      perProject: perProject.map((p) => ({ projectId: p.projectId, count: p._count._all })),
      tags,
      perTag: perTag.map((t) => ({ tagId: t.tagId, count: t._count.tagId })),
    });
  }
}

/** ประกอบผลลัพธ์จากข้อมูลดิบ — แยกเป็น pure function เพื่อทดสอบโดยไม่ต้องมีฐานข้อมูล */
export function buildSidebar(input: {
  counts: TaskSidebarDto['smartLists'];
  projects: { id: string; name: string; color: string }[];
  perProject: { projectId: string | null; count: number }[];
  tags: { id: string; name: string }[];
  perTag: { tagId: string; count: number }[];
}): TaskSidebarDto {
  const projectCount = new Map(input.perProject.map((p) => [p.projectId, p.count]));
  const tagName = new Map(input.tags.map((t) => [t.id, t.name]));

  return {
    smartLists: input.counts,
    // โปรเจกต์ที่ไม่มีงานค้างก็ยังแสดง (count 0) — เพิ่งสร้างแล้วหายไปจาก sidebar จะงง
    projects: input.projects.map((p) => ({ ...p, count: projectCount.get(p.id) ?? 0 })),
    topTags: input.perTag
      .filter((t) => tagName.has(t.tagId))
      .map((t) => ({ id: t.tagId, name: tagName.get(t.tagId)!, count: t.count })),
  };
}
