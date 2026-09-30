'use client';

import { CalendarDays, CalendarRange, Folder, Inbox, type LucideIcon } from 'lucide-react';
import { cn } from '@nosion/ui';
import { Chip } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { useProjects, useTags } from '@/features/entries/use-entries';
import type { SmartList } from './use-task-view';

const SMART_LISTS: { value: SmartList; label: string; icon: LucideIcon }[] = [
  { value: 'all', label: 'ทั้งหมด', icon: Inbox },
  { value: 'today', label: 'วันนี้', icon: CalendarDays },
  { value: 'week', label: '7 วันข้างหน้า', icon: CalendarRange },
];

/**
 * Sidebar ของหน้า Tasks (8.11.2) — smart list + โปรเจกต์ + แท็กยอดนิยม
 * ตัวเลขนับต่อรายการ + Inbox + การ์ด Focus จะมาพร้อม GET /tasks/sidebar และ /tasks/focus/today
 */
export function TaskSidebar({
  value,
  onChange,
}: {
  value: SmartList;
  onChange: (value: SmartList) => void;
}) {
  const projects = useProjects();
  const tags = useTags();
  const activeProjects = (projects.data ?? []).filter((p) => !p.isArchived);

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
                active={value === item.value}
                onClick={() => onChange(item.value)}
              />
            </li>
          ))}
        </ul>

        {activeProjects.length > 0 ? (
          <>
            <SectionLabel>โปรเจกต์</SectionLabel>
            <ul className="space-y-0.5">
              {activeProjects.map((project) => (
                <li key={project.id}>
                  <SideItem
                    icon={Folder}
                    label={project.name}
                    active={value === `project:${project.id}`}
                    onClick={() => onChange(`project:${project.id}`)}
                  />
                </li>
              ))}
            </ul>
          </>
        ) : null}

        {tags.data && tags.data.length > 0 ? (
          <>
            <SectionLabel>แท็กยอดนิยม</SectionLabel>
            <div className="flex flex-wrap gap-1.5 px-2 pb-1">
              {tags.data.slice(0, 6).map((tag) => {
                const key = `tag:${tag.id}` as const;
                const selected = value === key;
                return (
                  <Chip
                    key={tag.id}
                    selected={selected}
                    onClick={() => onChange(selected ? 'all' : key)}
                    className="h-6 px-2.5 font-mono text-[11px]"
                  >
                    #{tag.name}
                  </Chip>
                );
              })}
            </div>
          </>
        ) : null}
      </nav>
    </Card>
  );
}

/** มือถือ: smart list กลายเป็นแถบเลื่อนแนวนอน (8.11.2) */
export function TaskSmartListBar({
  value,
  onChange,
}: {
  value: SmartList;
  onChange: (value: SmartList) => void;
}) {
  return (
    <div
      role="group"
      aria-label="รายการงาน"
      className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:hidden"
    >
      {SMART_LISTS.map((item) => (
        <Chip
          key={item.value}
          selected={value === item.value}
          onClick={() => onChange(item.value)}
          className="shrink-0"
        >
          {item.label}
        </Chip>
      ))}
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
  active,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
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
      <span className="truncate">{label}</span>
    </button>
  );
}
