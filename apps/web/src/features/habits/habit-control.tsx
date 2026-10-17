'use client';

import type { HabitDayState, HabitKind } from '@nosion/contracts';
import { cn } from '@nosion/ui';
import { Check, Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { tr } from '@/i18n/current';

/**
 * ปุ่มของรอบวันนี้ตาม `kind` (สเปก 8.11.1 การ์ดนิสัย · 5.4) — ใช้ทั้งหน้า /habits และการ์ดในหน้า Today
 *  count       → −1 / +1 + progress
 *  check       → "สำเร็จ" (กดซ้ำ = ยกเลิก)
 *  before_time → บอกเวลาที่ต้องทำให้ทัน + "ทำเครื่องหมายว่าสำเร็จ"
 */
export function HabitControl({
  title,
  kind,
  current,
  target,
  unit,
  deadlineLocalTime,
  done,
  onIncrement,
  onCheck,
}: {
  title: string;
  kind: HabitKind;
  current: number;
  target: number;
  unit: string;
  deadlineLocalTime: string | null;
  done: boolean;
  onIncrement: (delta: 1 | -1) => void;
  onCheck: (done: boolean) => void;
}) {
  if (kind === 'count') {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="icon-sm"
            shape="circle"
            aria-label={tr('habits.decrement', { title, unit })}
            disabled={current <= 0}
            onClick={() => onIncrement(-1)}
          >
            <Minus size={14} aria-hidden="true" />
          </Button>
          <p className="min-w-20 text-center font-mono text-sm" aria-live="polite">
            <span className="text-base font-semibold">{current}</span>/{target} {unit}
          </p>
          <Button
            variant="secondary"
            size="icon-sm"
            shape="circle"
            aria-label={tr('habits.increment', { title, unit })}
            onClick={() => onIncrement(1)}
          >
            <Plus size={14} aria-hidden="true" />
          </Button>
          {done ? (
            <span className="text-xs text-success">
              <Check size={12} className="inline" aria-hidden="true" /> {tr('habits.goalMet')}
            </span>
          ) : null}
        </div>
        <Progress
          value={Math.min(current, target)}
          max={target}
          label={tr('habits.progressLabel', { title, current, target, unit })}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {kind === 'before_time' && deadlineLocalTime && !done ? (
        <span className="text-xs text-fg-secondary">
          {tr('habits.beforeDeadline', { time: deadlineLocalTime ?? '' })}
        </span>
      ) : null}
      <Button
        size="sm"
        shape="pill"
        variant={done ? 'secondary' : 'primary'}
        aria-pressed={done}
        aria-label={done ? tr('habits.uncheck', { title }) : tr('habits.check', { title })}
        onClick={() => onCheck(!done)}
        className="gap-1.5"
      >
        <Check size={14} aria-hidden="true" />
        {done
          ? tr('habits.succeeded')
          : kind === 'before_time'
            ? tr('habits.markSucceeded')
            : tr('habits.succeed')}
      </Button>
    </div>
  );
}

const stateLabel = (state: HabitDayState) => tr(`habits.state.${state}`);

/** แถบ 7 วันล่าสุด — สถานะบอกด้วยรูปทรง/สัญลักษณ์ ไม่พึ่งสีอย่างเดียว */
export function SevenDays({ days }: { days: { date: string; state: HabitDayState }[] }) {
  return (
    <ol className="flex gap-1" aria-label={tr('habits.last7')}>
      {days.map((d) => (
        <li
          key={d.date}
          title={`${d.date} · ${stateLabel(d.state)}`}
          aria-label={`${Number(d.date.slice(8, 10))} · ${stateLabel(d.state)}`}
          className={cn(
            'flex size-6 items-center justify-center rounded-[6px] text-[11px] font-medium',
            d.state === 'done' && 'bg-primary text-primary-fg',
            d.state === 'missed' && 'border border-dashed border-hairline-strong text-fg-secondary',
            d.state === 'pending' && 'border-2 border-accent text-fg',
            d.state === 'skipped' && 'bg-sunken text-fg-secondary',
            d.state === 'none' && 'text-fg-secondary',
          )}
        >
          {d.state === 'done' ? '✓' : d.state === 'skipped' ? '–' : d.state === 'missed' ? '×' : ''}
        </li>
      ))}
    </ol>
  );
}
