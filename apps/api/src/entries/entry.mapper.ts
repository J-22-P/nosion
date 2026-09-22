import { type EntryDto } from '@nosion/contracts';
import { type Entry as DomainEntry } from '@nosion/core';
import type { Entry, EntryTag, Prisma, Tag } from '@prisma/client';

export type EntryWithRelations = Entry & { tags?: (EntryTag & { tag: Tag })[] };

/** Prisma row → domain entry (ไม่มี field ของ persistence หลุดเข้าไปใน core) */
export function toDomain(row: Entry): DomainEntry {
  return {
    id: row.id,
    userId: row.userId,
    module: row.module,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    occurredAt: row.occurredAt,
    isAllDay: row.isAllDay,
    completedAt: row.completedAt,
    payload: (row.payload ?? {}) as Record<string, unknown>,
    projectId: row.projectId,
    parentId: row.parentId,
    recurrenceRuleId: row.recurrenceRuleId,
    recurrenceSlot: row.recurrenceSlot,
    sortOrder: row.sortOrder,
    clientId: row.clientId,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}

/** Prisma row → JSON ที่ส่งออก API (วันที่เป็น ISO string เสมอ) */
export function toDto(row: EntryWithRelations): EntryDto {
  return {
    id: row.id,
    module: row.module,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    occurredAt: row.occurredAt?.toISOString() ?? null,
    isAllDay: row.isAllDay,
    completedAt: row.completedAt?.toISOString() ?? null,
    payload: (row.payload ?? {}) as Record<string, unknown>,
    projectId: row.projectId,
    parentId: row.parentId,
    recurrenceRuleId: row.recurrenceRuleId,
    tags: (row.tags ?? []).map((t) => ({ id: t.tag.id, name: t.tag.name, color: t.tag.color })),
    sortOrder: row.sortOrder,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: row.deletedAt?.toISOString() ?? null,
  };
}

/** field ที่อนุญาตให้ sort ได้ — ป้องกันการยิงชื่อคอลัมน์มั่ว */
const SORTABLE = new Set(['occurredAt', 'priority', 'createdAt', 'updatedAt', 'title', 'sortOrder']);

/** "occurredAt:asc,priority:desc" → orderBy ของ Prisma (เติม id ท้ายเสมอเพื่อให้ cursor เสถียร) */
export function parseSort(sort: string): Prisma.EntryOrderByWithRelationInput[] {
  const parsed = sort
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [field, dir] = part.split(':');
      return { field: field ?? '', dir: dir === 'desc' ? 'desc' : 'asc' } as const;
    })
    .filter((s) => SORTABLE.has(s.field))
    .map(
      ({ field, dir }) =>
        ({
          [field]: field === 'occurredAt' ? { sort: dir, nulls: 'last' } : dir,
        }) as Prisma.EntryOrderByWithRelationInput,
    );

  return [...parsed, { id: 'asc' }];
}
