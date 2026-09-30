'use client';

import { taskPayloadSchema, type EntryDto, type TaskPayload } from '@nosion/contracts';
import {
  AlertTriangle,
  CalendarClock,
  CalendarPlus,
  GitBranch,
  GitPullRequest,
  History,
  MoreHorizontal,
  Play,
  Square,
  Trash2,
  Undo2,
  Zap,
} from 'lucide-react';
import { memo } from 'react';
import { cn } from '@nosion/ui';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Menu } from '@/components/ui/menu';
import { Progress } from '@/components/ui/progress';
import { formatDueDate, isOverdueDate, PRIORITY_TONE } from '@/lib/format';

/** ป้าย priority บน card เป็นอังกฤษตัวใหญ่ตาม mockup — low/none ไม่แสดง (8.11.2) */
const PRIORITY_CHIP: Partial<Record<EntryDto['priority'], string>> = {
  urgent: 'URGENT',
  high: 'HIGH',
  medium: 'MEDIUM',
};

/** payload ใน JSONB อาจมาจากเวอร์ชันเก่า → parse แบบให้อภัย ได้ค่าเริ่มต้นแทนการพัง */
function readPayload(entry: EntryDto): TaskPayload | null {
  const result = taskPayloadSchema.safeParse(entry.payload ?? {});
  return result.success ? result.data : null;
}

/** description ยาวหรือมีไวยากรณ์ markdown → แสดง badge MD */
function looksLikeMarkdown(text: string | null): boolean {
  if (!text) return false;
  return text.length > 200 || /(^|\n)\s*(#{1,6}\s|[-*]\s|```|\d+\.\s)/.test(text);
}

export interface TaskCardProps {
  entry: EntryDto;
  projectName?: string;
  onToggle: () => void;
  onDefer: (to: 'tomorrow' | 'next-week') => void;
  onDelete: () => void;
  /** งานนี้กำลังจับเวลาอยู่หรือไม่ */
  timerRunning?: boolean;
  onToggleTimer?: () => void;
}

/**
 * การ์ดงาน (สเปก 8.11.2) — แถว level 1.5 · checkbox วงกลม · priority chip · metadata chips
 * desktop ปุ่มอยู่ขวาบน / มือถือย้ายไปแถวล่าง
 */
export const TaskCard = memo(function TaskCard({
  entry,
  projectName,
  onToggle,
  onDefer,
  onDelete,
  timerRunning = false,
  onToggleTimer,
}: TaskCardProps) {
  const done = entry.status === 'done';
  const overdue = isOverdueDate(entry.occurredAt, entry.status);
  const due = formatDueDate(entry.occurredAt);
  const payload = readPayload(entry);
  const checklist = payload?.checklist ?? [];
  const checklistDone = checklist.filter((c) => c.done).length;
  const priorityChip = PRIORITY_CHIP[entry.priority];
  const deferCount = payload?.deferCount ?? 0;

  return (
    <li
      className={cn(
        'group relative flex gap-3 rounded-row bg-sunken p-4 transition-colors duration-[180ms] hover:bg-wash-active',
        'max-md:flex-wrap',
      )}
    >
      <Checkbox
        checked={done}
        onCheckedChange={onToggle}
        aria-label={done ? `ยกเลิกเสร็จ: ${entry.title}` : `ทำเครื่องหมายว่าเสร็จ: ${entry.title}`}
        className="mt-0.5"
      />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {priorityChip && !done ? (
            <Badge tone={PRIORITY_TONE[entry.priority]} lang="en" className="h-5 px-2 text-[10px]">
              <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
              {priorityChip}
            </Badge>
          ) : null}
          <p
            className={cn(
              'min-w-0 text-[15px] font-medium leading-snug transition-colors duration-200',
              // สเปกให้ใช้ text-tertiary แต่ contrast ไม่ถึง 4.5:1 → ใช้ secondary + ขีดฆ่า (ADR-009)
              done && 'text-fg-secondary line-through',
            )}
          >
            {entry.title}
          </p>
          {looksLikeMarkdown(entry.description) ? (
            <Badge tone="outline" mono className="h-5 px-1.5">
              MD
            </Badge>
          ) : null}
        </div>

        {entry.description && !done ? (
          <p className="mt-1 truncate text-[13px] text-fg-secondary">
            {entry.description.replace(/[#*`>]/g, '').trim()}
          </p>
        ) : null}

        {checklist.length > 0 && !done ? (
          <div className="mt-3 flex max-w-sm items-center gap-3">
            <span className="shrink-0 text-xs text-fg-secondary">
              Subtasks{' '}
              <span className="font-mono">
                ({checklistDone}/{checklist.length})
              </span>
            </span>
            <Progress value={checklistDone} max={checklist.length} label="ความคืบหน้างานย่อย" />
          </div>
        ) : null}

        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {due ? (
            <Badge
              tone={overdue ? 'danger' : 'outline'}
              aria-label={overdue ? `เลยกำหนด ${due}` : `กำหนดส่ง ${due}`}
            >
              {overdue ? (
                <AlertTriangle aria-hidden="true" />
              ) : (
                <CalendarClock aria-hidden="true" />
              )}
              {due}
            </Badge>
          ) : null}
          {payload?.branchName ? (
            <Badge tone="outline" mono>
              <GitBranch aria-hidden="true" />
              {payload.branchName}
            </Badge>
          ) : null}
          {payload?.github?.prNumber ? (
            <Badge tone="outline" mono>
              <GitPullRequest aria-hidden="true" />
              PR #{payload.github.prNumber}
            </Badge>
          ) : null}
          {payload?.github?.autoCloseOnMerge ? (
            <Badge tone="outline" lang="en">
              <Zap aria-hidden="true" />
              Auto-close
            </Badge>
          ) : null}
          {deferCount >= 1 ? (
            <Badge tone={deferCount >= 3 ? 'warning' : 'outline'}>
              <History aria-hidden="true" />
              เลื่อนแล้ว {deferCount} ครั้ง
            </Badge>
          ) : null}
          {entry.tags.map((tag) => (
            <span key={tag.id} className="font-mono text-[11px] text-fg-secondary">
              #{tag.name}
            </span>
          ))}
          {projectName ? (
            <span className="ml-auto truncate text-xs text-fg-secondary">{projectName}</span>
          ) : null}
        </div>
      </div>

      <div className="flex shrink-0 items-start gap-1 max-md:w-full max-md:justify-end max-md:pl-8">
        {done ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggle}
            aria-label={`ย้อนกลับ: ${entry.title}`}
          >
            <Undo2 size={14} aria-hidden="true" /> ย้อนกลับ
          </Button>
        ) : (
          <>
            {onToggleTimer ? (
              <Button
                variant={timerRunning ? 'primary' : 'secondary'}
                size="sm"
                onClick={onToggleTimer}
                aria-pressed={timerRunning}
                aria-label={
                  timerRunning ? `หยุดจับเวลา ${entry.title}` : `เริ่มจับเวลา ${entry.title}`
                }
              >
                {timerRunning ? (
                  <Square size={12} fill="currentColor" aria-hidden="true" />
                ) : (
                  <Play size={12} fill="currentColor" aria-hidden="true" />
                )}
                {timerRunning ? 'กำลังจับเวลา' : 'เริ่มจับเวลา'}
              </Button>
            ) : null}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onDefer('tomorrow')}
              aria-label={`เลื่อน ${entry.title} ไปพรุ่งนี้`}
            >
              <CalendarPlus size={14} aria-hidden="true" />
              +1 วัน
            </Button>
          </>
        )}
        <Menu
          label={`ตัวเลือกของ ${entry.title}`}
          trigger={<MoreHorizontal size={18} aria-hidden="true" />}
          items={[
            ...(done
              ? []
              : [
                  {
                    label: 'เลื่อนไปสัปดาห์หน้า',
                    icon: <CalendarClock />,
                    onSelect: () => onDefer('next-week'),
                  },
                ]),
            { label: 'ลบงาน', icon: <Trash2 />, tone: 'danger' as const, onSelect: onDelete },
          ]}
        />
      </div>
    </li>
  );
});
