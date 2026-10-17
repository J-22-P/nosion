'use client';

import { Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { QuickCapture } from './quick-capture';
import { TaskBoard } from './task-board';
import { FocusCard } from './focus-card';
import { TaskSidebar, TaskSmartListBar } from './task-sidebar';
import { useTaskSidebar } from './use-task-queries';
import { useTaskView, type TaskView } from './use-task-view';
import { useLocale, useTranslations } from 'next-intl';

const VIEWS: TaskView[] = ['list', 'project', 'overdue', 'priority'];

/** หน้า Tasks (สเปก 8.11.2) */
export function TasksView() {
  const { view, list, q, filters, setView, setList, setQuery } = useTaskView();
  const sidebar = useTaskSidebar();
  const pendingCount = sidebar.data?.smartLists.all ?? null;
  const t = useTranslations('tasksView');
  const locale = useLocale();

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <p className="font-mono text-[11px] uppercase tracking-wider text-fg-secondary" lang="en">
            Workspace / Tasks
          </p>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="text-[30px] font-semibold leading-tight md:text-[40px]">
              {t('title')}
              {locale === 'th' ? (
                <>
                  {' '}
                  <span className="text-fg-tertiary tracking-display" lang="en">
                    (Tasks)
                  </span>
                </>
              ) : null}
            </h1>
            {pendingCount !== null ? (
              <Badge tone="neutral" className="nums">
                {t('pending', { count: pendingCount })}
              </Badge>
            ) : null}
          </div>
        </div>
        <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] lg:mx-0 lg:px-0">
          <SegmentedControl<TaskView>
            label={t('viewLabel')}
            value={view}
            onChange={setView}
            options={VIEWS.map((v) => ({ value: v, label: t(v) }))}
          />
        </div>
      </header>

      {/* มือถือ: การ์ด Focus อยู่บนสุด (8.11.2) */}
      <FocusCard className="lg:hidden" />

      <QuickCapture />

      <TaskSmartListBar value={list} onChange={setList} />

      <div className="grid gap-6 lg:grid-cols-12">
        <aside className="hidden space-y-4 lg:col-span-3 lg:block">
          <SearchBox value={q} onChange={setQuery} />
          <TaskSidebar value={list} onChange={setList} />
          <FocusCard />
        </aside>
        <div className="min-w-0 space-y-4 lg:col-span-9">
          <div className="lg:hidden">
            <SearchBox value={q} onChange={setQuery} />
          </div>
          <TaskBoard filters={filters} view={view} />
        </div>
      </div>
    </div>
  );
}

/** ค้นหาชื่องาน — หน่วง 250ms ก่อนเขียนลง URL เพื่อไม่ยิง API ทุกตัวอักษร */
function SearchBox({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [draft, setDraft] = useState(value);
  const t = useTranslations('tasksView');

  useEffect(() => setDraft(value), [value]);

  useEffect(() => {
    if (draft === value) return;
    const timer = setTimeout(() => onChange(draft), 250);
    return () => clearTimeout(timer);
  }, [draft, value, onChange]);

  return (
    <label className="flex h-10 items-center gap-2 rounded-control border border-hairline bg-surface px-3 transition-shadow focus-within:shadow-[var(--focus-ring)]">
      <Search size={16} className="shrink-0 text-fg-secondary" aria-hidden="true" />
      <span className="sr-only">{t('search')}</span>
      <input
        type="search"
        data-shortcut="search"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={t('searchPlaceholder')}
        className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-fg-tertiary"
      />
    </label>
  );
}
