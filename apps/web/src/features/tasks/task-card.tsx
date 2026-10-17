'use client';

import { nosionRef, taskPayloadSchema, type EntryDto, type TaskPayload } from '@nosion/contracts';
import {
  AlertTriangle,
  CalendarClock,
  CalendarPlus,
  CircleDot,
  GitBranch,
  Link2,
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
import { toast } from 'sonner';
import { cn } from '@nosion/ui';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Menu } from '@/components/ui/menu';
import { Progress } from '@/components/ui/progress';
import { copyText } from '@/features/today/use-today';
import { formatDueDate, isOverdueDate, PRIORITY_TONE } from '@/lib/format';
import { PRIORITY_BY_DIGIT } from '@/lib/shortcuts/keymap';
import { useTranslations } from 'next-intl';

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
  /** ปุ่มลัด x — เลือกไว้ทำหลายรายการพร้อมกัน */
  selected?: boolean;
  onSelect?: () => void;
  /** ปุ่มลัด 1–4 */
  onPriority?: (priority: Exclude<EntryDto['priority'], 'none'>) => void;
  /** มี operation ค้างใน outbox (ยังไม่ถึง server) → จุดสีเทาที่มุม (สเปก 8.6) */
  pending?: boolean;
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
  selected = false,
  onSelect,
  onPriority,
  pending = false,
}: TaskCardProps) {
  const t = useTranslations('taskCard');
  const done = entry.status === 'done';
  const overdue = isOverdueDate(entry.occurredAt, entry.status, entry.isAllDay);
  const due = formatDueDate(entry.occurredAt);
  const payload = readPayload(entry);
  const checklist = payload?.checklist ?? [];
  const checklistDone = checklist.filter((c) => c.done).length;
  const priorityChip = PRIORITY_CHIP[entry.priority];
  const deferCount = payload?.deferCount ?? 0;

  /**
   * ปุ่มลัดระดับรายการ (สเปก 8.4) — ทำงานเมื่อการ์ดเองถูกโฟกัส (เลื่อนมาด้วย j / k หรือ Tab)
   * ไม่จับเมื่อโฟกัสอยู่ที่ปุ่มข้างใน — Enter/Space ของปุ่มต้องทำงานตามปกติ
   */
  function onKeyDown(event: React.KeyboardEvent<HTMLLIElement>) {
    if (event.target !== event.currentTarget) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const digit = PRIORITY_BY_DIGIT[event.key as keyof typeof PRIORITY_BY_DIGIT];
    if (event.key === 'e') onToggle();
    else if (event.key === 't' && !done) onDefer('tomorrow');
    else if (event.key === 'x' && onSelect) onSelect();
    else if (digit && onPriority && !done) onPriority(digit);
    else return;
    event.preventDefault();
  }

  return (
    <li
      data-shortcut-item
      tabIndex={0}
      onKeyDown={onKeyDown}
      aria-label={`${entry.title}${selected ? t('selected') : ''}${pending ? t('pending') : ''}`}
      className={cn(
        'group relative flex gap-3 rounded-row bg-sunken p-4 transition-colors duration-[180ms] hover:bg-wash-active',
        'focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] focus-visible:ring-2 focus-visible:ring-accent',
        selected && 'ring-2 ring-accent',
        'max-md:flex-wrap',
      )}
    >
      {pending ? (
        <span
          title={t('pendingTitle')}
          data-testid="pending-dot"
          aria-hidden="true"
          className="absolute left-1.5 top-1.5 size-1.5 rounded-full bg-fg-tertiary"
        />
      ) : null}
      <Checkbox
        checked={done}
        onCheckedChange={onToggle}
        aria-label={
          done ? t('uncomplete', { title: entry.title }) : t('complete', { title: entry.title })
        }
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
            <Progress value={checklistDone} max={checklist.length} label={t('checklist')} />
          </div>
        ) : null}

        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {due ? (
            <Badge
              tone={overdue ? 'danger' : 'outline'}
              aria-label={overdue ? t('overdue', { due }) : t('due', { due })}
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
          {payload?.github ? <GitHubBadge github={payload.github} /> : null}
          {payload?.github?.autoCloseOnMerge ? (
            <Badge tone="outline" lang="en">
              <Zap aria-hidden="true" />
              Auto-close
            </Badge>
          ) : null}
          {deferCount >= 1 ? (
            <Badge tone={deferCount >= 3 ? 'warning' : 'outline'}>
              <History aria-hidden="true" />
              {t('deferred', { count: deferCount })}
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
            aria-label={t('reopenLabel', { title: entry.title })}
          >
            <Undo2 size={14} aria-hidden="true" /> {t('reopen')}
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
                  timerRunning
                    ? t('stopTimerLabel', { title: entry.title })
                    : t('startTimerLabel', { title: entry.title })
                }
              >
                {timerRunning ? (
                  <Square size={12} fill="currentColor" aria-hidden="true" />
                ) : (
                  <Play size={12} fill="currentColor" aria-hidden="true" />
                )}
                {timerRunning ? t('timing') : t('startTimer')}
              </Button>
            ) : null}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onDefer('tomorrow')}
              aria-label={t('deferLabel', { title: entry.title })}
            >
              <CalendarPlus size={14} aria-hidden="true" />
              {t('plusOneDay')}
            </Button>
          </>
        )}
        <Menu
          label={t('options', { title: entry.title })}
          trigger={<MoreHorizontal size={18} aria-hidden="true" />}
          items={[
            ...(done
              ? []
              : [
                  {
                    label: t('deferWeek'),
                    icon: <CalendarClock />,
                    onSelect: () => onDefer('next-week'),
                  },
                ]),
            {
              // ใส่ในชื่อ/คำอธิบาย PR → PR merged แล้วงานนี้ปิดเอง (Phase 8 ขั้น 5)
              label: t('copyRef'),
              icon: <Link2 />,
              onSelect: () => {
                void copyText(nosionRef(entry.id)).then((ok) =>
                  ok
                    ? toast.success(t('copied'), {
                        description: t('copiedHint', { ref: nosionRef(entry.id) }),
                      })
                    : toast.error(t('copyFailed')),
                );
              },
            },
            { label: t('delete'), icon: <Trash2 />, tone: 'danger' as const, onSelect: onDelete },
          ]}
        />
      </div>
    </li>
  );
});

/**
 * ป้าย issue/PR ของ GitHub — งานที่ดึงมาจาก GitHub มีลิงก์ (Phase 8 ขั้น 5) กดแล้วเปิดหน้า GitHub
 * งานเก่าที่ใส่แค่เลข PR เอง (ไม่มีลิงก์) แสดงเป็นป้ายธรรมดาเหมือนเดิม
 */
function GitHubBadge({ github }: { github: NonNullable<TaskPayload['github']> }) {
  const t = useTranslations('taskCard');
  const number = github.prNumber ?? github.issueNumber;
  if (!number) return null;
  const Icon = github.prNumber ? GitPullRequest : CircleDot;
  const text = github.url
    ? `${github.repo}#${number}`
    : github.prNumber
      ? `PR #${number}`
      : `#${number}`;
  const content = (
    <>
      <Icon aria-hidden="true" />
      {text}
    </>
  );
  return github.url ? (
    <a
      href={github.url}
      target="_blank"
      rel="noreferrer"
      className="rounded-chip focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
      aria-label={t('openOnGitHub', { kind: github.prNumber ? 'PR' : 'issue', ref: text })}
    >
      <Badge tone="outline" mono className="hover:bg-wash">
        {content}
      </Badge>
    </a>
  ) : (
    <Badge tone="outline" mono>
      {content}
    </Badge>
  );
}
