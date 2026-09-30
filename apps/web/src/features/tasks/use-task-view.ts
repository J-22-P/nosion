'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';
import type { EntryFilters } from '@/features/entries/api';

export const TASK_VIEWS = ['list', 'project', 'overdue', 'priority'] as const;
export type TaskView = (typeof TASK_VIEWS)[number];

/** smart list ใน sidebar: all | inbox | today | week | project:<id> | tag:<id> */
export type SmartList = 'all' | 'inbox' | 'today' | 'week' | `project:${string}` | `tag:${string}`;

const BASE: EntryFilters = { module: 'task', status: 'pending,active', limit: 50 };

/** filter ตั้งต้นของทุกมุมมอง: งานที่ยังไม่เสร็จ เรียงตามกำหนดส่ง */
export const ACTIVE_TASKS_FILTERS: EntryFilters = { ...BASE, sort: 'occurredAt:asc' };

/** กลุ่ม "เสร็จสิ้นแล้ว" ท้ายรายการ */
export const DONE_TASKS_FILTERS: EntryFilters = {
  module: 'task',
  status: 'done',
  sort: 'updatedAt:desc',
  limit: 5,
};

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date: Date, plusDays = 0): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + plusDays);
  d.setHours(23, 59, 59, 999);
  return d;
}

/** แปลง view + smart list + คำค้น เป็น filter ของ GET /entries (pure — ทดสอบได้) */
export function buildTaskFilters(
  view: TaskView,
  list: SmartList,
  q: string,
  now: Date = new Date(),
): EntryFilters {
  const filters: EntryFilters = { ...ACTIVE_TASKS_FILTERS };

  if (view === 'overdue') filters.overdue = true;
  if (view === 'priority') filters.sort = 'priority:desc,occurredAt:asc';

  if (list === 'inbox') {
    // ไม่มีโปรเจกต์และไม่มีวันกำหนด — งานที่ยังไม่ได้จัดที่
    filters.inbox = true;
  } else if (list === 'today') {
    // "วันนี้" รวมงานที่เลยกำหนดด้วย — ยังต้องทำอยู่ดี
    filters.to = endOfDay(now).toISOString();
  } else if (list === 'week') {
    filters.from = startOfDay(now).toISOString();
    filters.to = endOfDay(now, 6).toISOString();
  } else if (list.startsWith('project:')) {
    filters.projectId = list.slice('project:'.length);
  } else if (list.startsWith('tag:')) {
    filters.tagIds = list.slice('tag:'.length);
  }

  const trimmed = q.trim();
  if (trimmed) filters.q = trimmed;
  return filters;
}

function parseView(value: string | null): TaskView {
  return (TASK_VIEWS as readonly string[]).includes(value ?? '') ? (value as TaskView) : 'list';
}

function parseList(value: string | null): SmartList {
  if (value === 'inbox' || value === 'today' || value === 'week') return value;
  if (value && /^(project|tag):[\w-]+$/.test(value)) return value as SmartList;
  return 'all';
}

/**
 * สถานะของหน้า Tasks อยู่ใน URL (สเปก 8.5 — share ลิงก์ได้ / refresh แล้วคงอยู่)
 * ?view=list|project|overdue|priority &list=inbox|today|week|project:<id>|tag:<id> &q=...
 */
export function useTaskView() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const view = parseView(params.get('view'));
  const list = parseList(params.get('list'));
  const q = params.get('q') ?? '';

  const update = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === '') next.delete(key);
        else next.set(key, value);
      }
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  const filters = useMemo(() => buildTaskFilters(view, list, q), [view, list, q]);

  const setView = useCallback(
    (value: TaskView) => update({ view: value === 'list' ? null : value }),
    [update],
  );
  const setList = useCallback(
    (value: SmartList) => update({ list: value === 'all' ? null : value }),
    [update],
  );
  const setQuery = useCallback((value: string) => update({ q: value || null }), [update]);

  return { view, list, q, filters, setView, setList, setQuery };
}
