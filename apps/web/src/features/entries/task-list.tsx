'use client';

import type { EntryDto } from '@nosion/contracts';
import { CalendarClock, Check, Trash2 } from 'lucide-react';
import { cn } from '@nosion/ui';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TaskListSkeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState, StaleBanner } from '@/components/shared/states';
import { ApiError } from '@/lib/api-client';
import { PRIORITY_CLASS, PRIORITY_LABEL, formatDueDate, isOverdueDate } from '@/lib/format';
import type { EntryFilters } from './api';
import { useCompleteEntry, useDeferEntry, useDeleteEntry, useEntries } from './use-entries';

export function TaskList({ filters }: { filters: EntryFilters }) {
  const query = useEntries(filters);
  const complete = useCompleteEntry(filters);
  const defer = useDeferEntry(filters);
  const remove = useDeleteEntry(filters);

  if (query.isPending) return <TaskListSkeleton />;

  // มีข้อมูลเก่าในแคชแต่ refetch ไม่ผ่าน → แสดงของเก่าพร้อมแถบเตือน ดีกว่าหน้าว่าง
  const hasStaleData = query.isError && query.data !== undefined;

  if (query.isError && !hasStaleData) {
    const message =
      query.error instanceof ApiError
        ? query.error.message
        : 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ตรวจว่า API ทำงานอยู่ที่พอร์ต 3001';
    return <ErrorState message={message} onRetry={() => void query.refetch()} />;
  }

  const entries = query.data?.data ?? [];

  if (entries.length === 0) {
    return (
      <EmptyState
        title="ยังไม่มีงานที่ตรงกับเงื่อนไขนี้"
        description="ลองล้างตัวกรอง หรือเพิ่มงานแรกจากช่องด้านบน"
      />
    );
  }

  return (
    <div>
      {hasStaleData ? <StaleBanner onRetry={() => void query.refetch()} /> : null}
      <ul className="divide-y divide-[var(--border)]">
        {entries.map((entry) => (
          <TaskRow
            key={entry.id}
            entry={entry}
            onComplete={() => complete.mutate(entry.id)}
            onDefer={() => defer.mutate({ id: entry.id, to: 'tomorrow' })}
            onDelete={() => remove.mutate(entry.id)}
          />
        ))}
      </ul>
      {query.data?.pageInfo.hasMore ? (
        <p className="px-4 py-3 text-xs text-[var(--muted-foreground)]">
          แสดง {entries.length} รายการแรก — เลื่อนดูเพิ่มเติมจะมาพร้อม infinite scroll ใน Phase ถัดไป
        </p>
      ) : null}
    </div>
  );
}

function TaskRow({
  entry,
  onComplete,
  onDefer,
  onDelete,
}: {
  entry: EntryDto;
  onComplete: () => void;
  onDefer: () => void;
  onDelete: () => void;
}) {
  const done = entry.status === 'done';
  const overdue = isOverdueDate(entry.occurredAt, entry.status);
  const due = formatDueDate(entry.occurredAt);

  return (
    <li className="group flex items-center gap-3 px-4 py-3">
      <button
        type="button"
        onClick={onComplete}
        disabled={done}
        aria-label={done ? `${entry.title} เสร็จแล้ว` : `ทำเครื่องหมายว่า ${entry.title} เสร็จแล้ว`}
        className={cn(
          'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors',
          done
            ? 'border-[var(--status-done)] bg-[var(--status-done)] text-white'
            : 'border-[var(--border)] hover:border-[var(--primary)]',
        )}
      >
        {done ? <Check size={12} aria-hidden="true" /> : null}
      </button>

      <div className="min-w-0 flex-1">
        <p className={cn('truncate text-sm', done && 'text-[var(--muted-foreground)] line-through')}>
          {entry.title}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--muted-foreground)]">
          {due ? (
            <span className={cn(overdue && 'font-medium text-[var(--status-overdue)]')}>{due}</span>
          ) : null}
          {entry.priority !== 'none' ? (
            <span className={PRIORITY_CLASS[entry.priority]}>{PRIORITY_LABEL[entry.priority]}</span>
          ) : null}
          {entry.tags.map((tag) => (
            <Badge key={tag.id} color={tag.color}>
              {tag.name}
            </Badge>
          ))}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
        {!done ? (
          <Button variant="ghost" size="icon" onClick={onDefer} aria-label={`เลื่อน ${entry.title} ไปพรุ่งนี้`}>
            <CalendarClock size={15} />
          </Button>
        ) : null}
        <Button variant="ghost" size="icon" onClick={onDelete} aria-label={`ลบ ${entry.title}`}>
          <Trash2 size={15} />
        </Button>
      </div>
    </li>
  );
}
