'use client';

import type { EntryDto, Priority } from '@nosion/contracts';
import { CheckCheck, ListTodo } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { TaskListSkeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState, StaleBanner } from '@/components/shared/states';
import { Button } from '@/components/ui/button';
import { entriesApi, type EntryFilters } from '@/features/entries/api';
import {
  useCompleteEntry,
  useDeferEntry,
  useDeleteEntry,
  useEntries,
  useProjects,
  useReopenEntry,
  useUpdateEntry,
} from '@/features/entries/use-entries';
import { usePendingView } from '@/features/sync/use-sync';
import { pushUndo } from '@/lib/shortcuts/undo-store';
import { isLocalId } from '@/lib/sync';
import { ApiError } from '@/lib/api-client';
import { priorityLabel } from '@/lib/format';
import { TaskCard } from './task-card';
import { useFocusToday, useStartTimer, useStopTimer } from './use-task-queries';
import { DONE_TASKS_FILTERS, type TaskView } from './use-task-view';
import { errorText } from '@/i18n/errors';
import { useLocale, useTranslations } from 'next-intl';
import { tr } from '@/i18n/current';

/** ชื่ออังกฤษในวงเล็บต่อท้ายหัวการ์ดตาม mockup (เฉพาะภาษาไทย) */
const VIEW_TITLE_EN: Record<TaskView, string> = {
  list: 'Active Tasks',
  project: 'By Project',
  overdue: 'Overdue',
  priority: 'By Priority',
};

const PRIORITY_ORDER: Priority[] = ['urgent', 'high', 'medium', 'low', 'none'];

interface Group {
  key: string;
  label: string | null;
  entries: EntryDto[];
}

/** จัดกลุ่มตาม view — list/overdue ไม่มีหัวกลุ่ม */
function groupEntries(
  entries: EntryDto[],
  view: TaskView,
  projectNames: Map<string, string>,
): Group[] {
  if (view === 'project') {
    const groups = new Map<string, EntryDto[]>();
    for (const entry of entries) {
      const key = entry.projectId ?? '';
      groups.set(key, [...(groups.get(key) ?? []), entry]);
    }
    return [...groups.entries()]
      .map(([key, items]) => ({
        key: key || 'none',
        label: key ? (projectNames.get(key) ?? tr('tasks.project')) : tr('tasks.noProject'),
        entries: items,
      }))
      .sort((a, b) => (a.key === 'none' ? 1 : b.key === 'none' ? -1 : 0));
  }
  if (view === 'priority') {
    return PRIORITY_ORDER.map((p) => ({
      key: p,
      label:
        p === 'none'
          ? tr('tasks.noPriority')
          : tr('tasks.priorityGroup', { level: priorityLabel(p) }),
      entries: entries.filter((e) => e.priority === p),
    })).filter((g) => g.entries.length > 0);
  }
  return [{ key: 'all', label: null, entries }];
}

export function TaskBoard({ filters, view }: { filters: EntryFilters; view: TaskView }) {
  const t = useTranslations('tasks');
  const locale = useLocale();
  const query = useEntries(filters);
  const doneQuery = useEntries(DONE_TASKS_FILTERS);
  const projects = useProjects();
  const complete = useCompleteEntry(filters);
  const defer = useDeferEntry(filters);
  const remove = useDeleteEntry(filters);
  const reopen = useReopenEntry();
  const update = useUpdateEntry(filters);
  const queryClient = useQueryClient();
  /** ปุ่มลัด x (สเปก 8.4) — id ที่เลือกไว้สำหรับทำหลายรายการพร้อมกัน */
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const focus = useFocusToday();
  const startTimer = useStartTimer();
  const stopTimer = useStopTimer();
  const runningEntryId = focus.data?.running?.entryId ?? null;

  const projectNames = useMemo(
    () => new Map((projects.data ?? []).map((p) => [p.id, p.name])),
    [projects.data],
  );

  /**
   * งานที่สร้างตอนออฟไลน์ (ยังไม่มีในแคชจาก server) แสดงต่อท้ายรายการ — เฉพาะมุมมองที่ไม่ได้กรองด้วย
   * โปรเจกต์/แท็ก/คำค้น (ฝั่ง client ยังไม่รู้ค่าเหล่านั้นจนกว่า server จะ parse ตอนซิงก์)
   */
  const pending = usePendingView();
  const showLocal = !filters.projectId && !filters.tagIds && !filters.q;
  const localTasks = useMemo(
    () => (showLocal ? pending.created.filter((e) => e.module === 'task') : []),
    [pending.created, showLocal],
  );
  const entries = useMemo(
    () => [...(query.data?.data ?? []), ...localTasks.filter((e) => e.status !== 'done')],
    [query.data, localTasks],
  );
  const groups = useMemo(
    () => groupEntries(entries, view, projectNames),
    [entries, view, projectNames],
  );

  function toggle(entry: EntryDto) {
    if (entry.status === 'done') {
      reopen.mutate(entry);
      return;
    }
    complete.mutate(entry.id, {
      onSuccess: (updated) => {
        pushUndo({
          label: t('undoComplete', { title: entry.title }),
          run: () => reopen.mutateAsync(updated as EntryDto),
        });
        toast.success(t('done'), {
          description: entry.title,
          action: {
            label: t('undo'),
            onClick: () => reopen.mutate(updated as EntryDto),
          },
        });
      },
    });
  }

  /** ⌘Z ของการเลื่อน = ย้ายกลับวันเดิม ด้วย version ที่ server คืนมาหลังเลื่อน */
  function deferEntry(entry: EntryDto, to: 'tomorrow' | 'next-week') {
    defer.mutate(
      { id: entry.id, to },
      {
        onSuccess: (moved) =>
          pushUndo({
            label: t('undoDefer', { title: entry.title }),
            run: () =>
              entriesApi
                .update(entry.id, {
                  occurredAt: entry.occurredAt,
                  isAllDay: entry.isAllDay,
                  version: (moved as EntryDto).version,
                })
                .finally(() => queryClient.invalidateQueries({ queryKey: ['entries'] })),
          }),
      },
    );
  }

  function deleteEntry(entry: EntryDto) {
    remove.mutate(entry.id, {
      onSuccess: () =>
        pushUndo({
          label: t('undoDelete', { title: entry.title }),
          run: () =>
            entriesApi
              .restore(entry.id)
              .finally(() => queryClient.invalidateQueries({ queryKey: ['entries'] })),
        }),
    });
  }

  function setPriority(entry: EntryDto, priority: EntryDto['priority']) {
    if (entry.priority === priority) return;
    update.mutate(
      { id: entry.id, input: { priority, version: entry.version } },
      {
        onSuccess: (changed) => {
          toast.success(t('priorityChanged', { level: priorityLabel(priority) }), {
            description: entry.title,
          });
          pushUndo({
            label: t('undoPriority', { title: entry.title }),
            run: () =>
              entriesApi
                .update(entry.id, {
                  priority: entry.priority,
                  version: (changed as EntryDto).version,
                })
                .finally(() => queryClient.invalidateQueries({ queryKey: ['entries'] })),
          });
        },
      },
    );
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function bulk(action: 'complete' | 'defer' | 'delete') {
    const ids = [...selected];
    try {
      const { affected } = await entriesApi.bulk({
        ids,
        action,
        ...(action === 'defer' ? { to: 'tomorrow' } : {}),
      });
      toast.success(t(`bulkDone.${action}`, { count: affected }));
      setSelected(new Set());
    } catch (error) {
      toast.error(t('bulkFailed'), {
        description: errorText(error),
      });
    } finally {
      void queryClient.invalidateQueries({ queryKey: ['entries'] });
    }
  }

  function handlers(entry: EntryDto) {
    return {
      onToggle: () => toggle(entry),
      onDefer: (to: 'tomorrow' | 'next-week') => deferEntry(entry, to),
      onDelete: () => deleteEntry(entry),
      selected: selected.has(entry.id),
      onSelect: () => toggleSelect(entry.id),
      onPriority: (priority: EntryDto['priority']) => setPriority(entry, priority),
      timerRunning: runningEntryId === entry.id,
      // จับเวลาต้องออนไลน์และต้องมี id จริง — งานที่ยังรอซิงก์ไม่มีปุ่มนี้
      onToggleTimer: isLocalId(entry.id)
        ? undefined
        : () =>
            runningEntryId === entry.id ? stopTimer.stop(entry.id) : startTimer.mutate(entry.id),
      pending: pending.touched.has(entry.id),
    };
  }

  const titleEn = VIEW_TITLE_EN[view];
  const hasStaleData = query.isError && query.data !== undefined;
  const countLabel = query.data?.pageInfo.hasMore ? `${entries.length}+` : `${entries.length}`;

  let body: React.ReactNode;
  if (query.isPending) {
    body = <TaskListSkeleton />;
  } else if (query.isError && !hasStaleData) {
    const message = query.error instanceof ApiError ? (errorText(query.error) ?? '') : t('offline');
    body = <ErrorState message={message} onRetry={() => void query.refetch()} />;
  } else if (entries.length === 0) {
    body = (
      <EmptyState
        title={view === 'overdue' ? t('emptyOverdue') : t('emptyView')}
        description={view === 'overdue' ? t('emptyOverdueHint') : t('emptyViewHint')}
      />
    );
  } else {
    body = (
      <>
        {hasStaleData ? <StaleBanner onRetry={() => void query.refetch()} /> : null}
        <div className="space-y-5">
          {groups.map((group) => (
            <section key={group.key} aria-label={group.label ?? undefined}>
              {group.label ? (
                <h3 className="mb-2 flex items-center gap-2 px-1 text-[13px] font-medium text-fg-secondary">
                  {group.label}
                  <span className="font-mono text-[11px]">{group.entries.length}</span>
                </h3>
              ) : null}
              <ul className="space-y-2">
                {group.entries.map((entry) => (
                  <TaskCard
                    key={entry.id}
                    entry={entry}
                    projectName={
                      view === 'project' || !entry.projectId
                        ? undefined
                        : projectNames.get(entry.projectId)
                    }
                    {...handlers(entry)}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      </>
    );
  }

  const doneEntries = [
    ...localTasks.filter((e) => e.status === 'done'),
    ...(doneQuery.data?.data ?? []),
  ];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          icon={<ListTodo />}
          title={
            <>
              {t(`view.${view}`)}
              {locale === 'th' ? (
                <>
                  {' '}
                  <span className="font-normal text-fg-secondary" lang="en">
                    ({titleEn})
                  </span>
                </>
              ) : null}
            </>
          }
          aside={
            query.isPending ? null : (
              <Badge tone={view === 'overdue' && entries.length > 0 ? 'danger' : 'neutral'} mono>
                {countLabel}
              </Badge>
            )
          }
        />
        <CardContent>
          {selected.size > 0 ? (
            <div
              role="toolbar"
              aria-label={t('bulkToolbar')}
              className="sticky top-16 z-10 mb-3 flex flex-wrap items-center gap-2 rounded-row bg-primary px-4 py-2.5 text-sm text-primary-fg"
            >
              <span className="mr-auto font-medium">
                {t('selectedCount', { count: selected.size })}
              </span>
              <Button size="sm" variant="secondary" onClick={() => void bulk('complete')}>
                {t('complete')}
              </Button>
              <Button size="sm" variant="secondary" onClick={() => void bulk('defer')}>
                {t('deferTomorrow')}
              </Button>
              <Button size="sm" variant="danger" onClick={() => void bulk('delete')}>
                {t('delete')}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-primary-fg hover:text-primary-fg"
                onClick={() => setSelected(new Set())}
              >
                {t('clearSelection')}
              </Button>
            </div>
          ) : null}
          {body}
        </CardContent>
      </Card>

      {doneEntries.length > 0 ? (
        <Card>
          <CardHeader icon={<CheckCheck />} title={t('doneTitle')} description={t('doneHint')} />
          <CardContent>
            <ul className="space-y-2">
              {doneEntries.map((entry) => (
                <TaskCard
                  key={entry.id}
                  entry={entry}
                  projectName={entry.projectId ? projectNames.get(entry.projectId) : undefined}
                  {...handlers(entry)}
                />
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
