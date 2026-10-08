'use client';

import type { TaskSidebarDto } from '@nosion/contracts';
import { CalendarDays, CalendarRange, Folder, Inbox, Layers, type LucideIcon } from 'lucide-react';
import { cn } from '@nosion/ui';
import { Chip } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useTaskSidebar } from './use-task-queries';
import type { SmartList } from './use-task-view';

type SmartKey = keyof Pick<TaskSidebarDto['smartLists'], 'all' | 'inbox' | 'today' | 'week'>;

const SMART_LISTS: { value: SmartKey; label: string; icon: LucideIcon }[] = [
  { value: 'all', label: 'ทั้งหมด', icon: Layers },
  { value: 'inbox', label: 'Inbox', icon: Inbox },
  { value: 'today', label: 'วันนี้', icon: CalendarDays },
  { value: 'week', label: '7 วันข้างหน้า', icon: CalendarRange },
];

/**
 * Sidebar ของหน้า Tasks (8.11.2) — ตัวเลขทั้งหมดมาจาก GET /tasks/sidebar คำขอเดียว
 */
export function TaskSidebar({
  value,
  onChange,
}: {
  value: SmartList;
  onChange: (value: SmartList) => void;
}) {
  const sidebar = useTaskSidebar();
  const data = sidebar.data;

  return (
    <Card className="p-3">
      <nav aria-label="รายการงาน">
        <SectionLabel>มุมมองหลัก</SectionLabel>
        <ul className="space-y-0.5">
          {SMART_LISTS.map((item) => (
            <li key={item.value}>
              <SideItem
                icon={item.icon}
                label={item.label}
                count={data?.smartLists[item.value]}
                loading={sidebar.isPending}
                active={value === item.value}
                onClick={() => onChange(item.value)}
              />
            </li>
          ))}
        </ul>

        {data && data.projects.length > 0 ? (
          <>
            <SectionLabel>โปรเจกต์</SectionLabel>
            <ul className="space-y-0.5">
              {data.projects.map((project) => (
                <li key={project.id}>
                  <SideItem
                    icon={Folder}
                    label={project.name}
                    count={project.count}
                    active={value === `project:${project.id}`}
                    onClick={() => onChange(`project:${project.id}`)}
                  />
                </li>
              ))}
            </ul>
          </>
        ) : null}

        {data && data.topTags.length > 0 ? (
          <>
            <SectionLabel>แท็กยอดนิยม</SectionLabel>
            <div className="flex flex-wrap gap-1.5 px-2 pb-1">
              {data.topTags.map((tag) => {
                const key = `tag:${tag.id}` as const;
                const selected = value === key;
                return (
                  <Chip
                    key={tag.id}
                    selected={selected}
                    onClick={() => onChange(selected ? 'all' : key)}
                    className="h-6 px-2.5 font-mono text-[11px]"
                    aria-label={`แท็ก ${tag.name} (${tag.count} งาน)`}
                  >
                    #{tag.name}
                  </Chip>
                );
              })}
            </div>
          </>
        ) : null}

        {/* โหลดไม่สำเร็จ: smart list ยังกดได้ (เป็นรายการคงที่) แต่โปรเจกต์/แท็ก/ตัวเลขหาย — บอกตรง ๆ ไม่ปล่อยเงียบ */}
        {sidebar.isError && !data ? (
          <p
            role="status"
            className="mt-2 flex items-center justify-between gap-2 px-2 text-xs text-fg-secondary"
          >
            โหลดโปรเจกต์และตัวเลขไม่สำเร็จ
            <button
              type="button"
              onClick={() => void sidebar.refetch()}
              className="rounded-[4px] font-medium text-accent hover:underline focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
            >
              ลองใหม่
            </button>
          </p>
        ) : null}
      </nav>
    </Card>
  );
}

/** มือถือ: smart list กลายเป็นแถบเลื่อนแนวนอนพร้อมตัวเลข (8.11.2) */
export function TaskSmartListBar({
  value,
  onChange,
}: {
  value: SmartList;
  onChange: (value: SmartList) => void;
}) {
  const sidebar = useTaskSidebar();
  return (
    <div
      role="group"
      aria-label="รายการงาน"
      className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:hidden"
    >
      {SMART_LISTS.map((item) => {
        const count = sidebar.data?.smartLists[item.value];
        return (
          <Chip
            key={item.value}
            selected={value === item.value}
            onClick={() => onChange(item.value)}
            className="shrink-0"
          >
            {item.label}
            {count !== undefined ? (
              <span className="nums font-mono text-[11px]">{count}</span>
            ) : null}
          </Chip>
        );
      })}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-1 mt-4 px-2 text-xs font-medium text-fg-secondary first:mt-1">{children}</p>
  );
}

function SideItem({
  icon: Icon,
  label,
  count,
  loading = false,
  active,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  count?: number;
  loading?: boolean;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'true' : undefined}
      className={cn(
        'flex h-9 w-full items-center gap-2.5 rounded-control px-2 text-left text-sm transition-colors duration-[180ms]',
        'focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]',
        active ? 'bg-sunken font-medium text-fg' : 'text-fg-secondary hover:bg-wash hover:text-fg',
      )}
    >
      <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {loading ? (
        <Skeleton className="h-3 w-4" />
      ) : count !== undefined ? (
        <span className="nums font-mono text-[11px] text-fg-secondary">{count}</span>
      ) : null}
    </button>
  );
}
