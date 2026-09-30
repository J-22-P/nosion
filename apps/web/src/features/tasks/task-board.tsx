'use client';

import type { EntryDto, Priority } from '@nosion/contracts';
import { CheckCheck, ListTodo } from 'lucide-react';
import { useMemo } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { TaskListSkeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState, StaleBanner } from '@/components/shared/states';
import type { EntryFilters } from '@/features/entries/api';
import {
  useCompleteEntry,
  useDeferEntry,
  useDeleteEntry,
  useEntries,
  useProjects,
  useReopenEntry,
} from '@/features/entries/use-entries';
import { ApiError } from '@/lib/api-client';
import { PRIORITY_LABEL } from '@/lib/format';
import { TaskCard } from './task-card';
import { useFocusToday, useStartTimer, useStopTimer } from './use-task-queries';
import { DONE_TASKS_FILTERS, type TaskView } from './use-task-view';

const VIEW_TITLE: Record<TaskView, { th: string; en: string }> = {
  list: { th: 'กำลังดำเนินการ', en: 'Active Tasks' },
  project: { th: 'แยกตามโปรเจกต์', en: 'By Project' },
  overdue: { th: 'เกินกำหนด', en: 'Overdue' },
  priority: { th: 'เรียงตามความสำคัญ', en: 'By Priority' },
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
        label: key ? (projectNames.get(key) ?? 'โปรเจกต์') : 'ไม่มีโปรเจกต์',
        entries: items,
      }))
      .sort((a, b) => (a.key === 'none' ? 1 : b.key === 'none' ? -1 : 0));
  }
  if (view === 'priority') {
    return PRIORITY_ORDER.map((p) => ({
      key: p,
      label: p === 'none' ? 'ไม่ระบุความสำคัญ' : `ความสำคัญ${PRIORITY_LABEL[p]}`,
      entries: entries.filter((e) => e.priority === p),
    })).filter((g) => g.entries.length > 0);
  }
  return [{ key: 'all', label: null, entries }];
}

export function TaskBoard({ filters, view }: { filters: EntryFilters; view: TaskView }) {
  const query = useEntries(filters);
  const doneQuery = useEntries(DONE_TASKS_FILTERS);
  const projects = useProjects();
  const complete = useCompleteEntry(filters);
  const defer = useDeferEntry(filters);
  const remove = useDeleteEntry(filters);
  const reopen = useReopenEntry();
  const focus = useFocusToday();
  const startTimer = useStartTimer();
  const stopTimer = useStopTimer();
  const runningEntryId = focus.data?.running?.entryId ?? null;

  const projectNames = useMemo(
    () => new Map((projects.data ?? []).map((p) => [p.id, p.name])),
    [projects.data],
  );

  const entries = query.data?.data ?? [];
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
        toast.success('เสร็จแล้ว', {
          description: entry.title,
          action: {
            label: 'เลิกทำ',
            onClick: () => reopen.mutate(updated as EntryDto),
          },
        });
      },
    });
  }

  function handlers(entry: EntryDto) {
    return {
      onToggle: () => toggle(entry),
      onDefer: (to: 'tomorrow' | 'next-week') => defer.mutate({ id: entry.id, to }),
      onDelete: () => remove.mutate(entry.id),
      timerRunning: runningEntryId === entry.id,
      onToggleTimer: () =>
        runningEntryId === entry.id ? stopTimer.stop(entry.id) : startTimer.mutate(entry.id),
    };
  }

  const title = VIEW_TITLE[view];
  const hasStaleData = query.isError && query.data !== undefined;
  const countLabel = query.data?.pageInfo.hasMore ? `${entries.length}+` : `${entries.length}`;

  let body: React.ReactNode;
  if (query.isPending) {
    body = <TaskListSkeleton />;
  } else if (query.isError && !hasStaleData) {
    const message =
      query.error instanceof ApiError
        ? query.error.message
        : 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ตรวจว่า API ทำงานอยู่';
    body = <ErrorState message={message} onRetry={() => void query.refetch()} />;
  } else if (entries.length === 0) {
    body = (
      <EmptyState
        title={view === 'overdue' ? 'ไม่มีงานเกินกำหนด' : 'ยังไม่มีงานในมุมมองนี้'}
        description={
          view === 'overdue'
            ? 'ทุกอย่างอยู่ในกำหนด ดีมาก'
            : 'พิมพ์ในช่องด้านบนแล้วกด Enter เพื่อเพิ่มงานแรก'
        }
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

  const doneEntries = doneQuery.data?.data ?? [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          icon={<ListTodo />}
          title={
            <>
              {title.th}{' '}
              <span className="font-normal text-fg-secondary" lang="en">
                ({title.en})
              </span>
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
        <CardContent>{body}</CardContent>
      </Card>

      {doneEntries.length > 0 ? (
        <Card>
          <CardHeader
            icon={<CheckCheck />}
            title="เสร็จสิ้นแล้ว"
            description="ล่าสุด 5 รายการ · กดย้อนกลับได้ถ้าติ๊กพลาด"
          />
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
