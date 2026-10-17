'use client';

import type { HabitKind, TodayWidgetDto } from '@nosion/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Progress } from '@/components/ui/progress';
import { habitsApi } from './api';
import { HabitControl } from './habit-control';
import { errorText } from '@/i18n/errors';
import { tr } from '@/i18n/current';

/** `widget.data.habits` ที่ HabitTrackableModule.summarizeToday ส่งมา (core ไม่อ่าน — เว็บของโมดูลตีความเอง) */
interface TodayHabit {
  entryId: string;
  title: string;
  subtitle: string | null;
  kind: HabitKind;
  currentValue: number;
  targetValue: number;
  unit: string;
  deadlineLocalTime: string | null;
  done: boolean;
}

/** หัวการ์ดขวา: "2/4" */
export function HabitAside({ widget }: { widget: TodayWidgetDto }) {
  return widget.progress ? (
    <span className="font-mono text-sm text-fg-secondary">
      {widget.progress.done}/{widget.progress.total}
    </span>
  ) : null;
}

/**
 * การ์ดนิสัยในหน้า Today (สเปก 8.11.1) — ปุ่มตาม kind: count −1/+1 · check "สำเร็จ" · before_time
 * กดแล้ว invalidate ['entries'] → การ์ดนี้, หน้า /habits และปฏิทินสดพร้อมกัน
 */
export function HabitBody({ widget }: { widget: TodayWidgetDto }) {
  const habits = (widget.data?.habits ?? []) as TodayHabit[];
  const queryClient = useQueryClient();
  const settle = () => void queryClient.invalidateQueries({ queryKey: ['entries'] });
  const fail = (error: unknown) =>
    toast.error(tr('habits.saveFailed'), {
      description: errorText(error),
    });

  const increment = useMutation({
    mutationFn: ({ entryId, delta }: { entryId: string; delta: 1 | -1 }) =>
      habitsApi.increment(entryId, delta),
    onError: fail,
    onSettled: settle,
  });
  const check = useMutation({
    mutationFn: ({ entryId, done }: { entryId: string; done: boolean }) =>
      habitsApi.check(entryId, done),
    onError: fail,
    onSettled: settle,
  });

  return (
    <>
      <p className="text-lg font-semibold">{widget.headline}</p>
      {widget.progress?.total ? (
        <Progress
          value={widget.progress.done}
          max={widget.progress.total}
          label={tr('habits.doneToday')}
        />
      ) : null}
      <ul className="space-y-2">
        {habits.map((h) => (
          <li key={h.entryId} className="space-y-2 rounded-row bg-sunken px-4 py-3">
            <p className="flex items-baseline justify-between gap-3 text-sm">
              <span className={h.done ? 'text-fg-secondary line-through' : 'font-medium'}>
                {h.title}
              </span>
              {h.subtitle ? (
                <span className="truncate text-xs text-fg-secondary">{h.subtitle}</span>
              ) : null}
            </p>
            <HabitControl
              title={h.title}
              kind={h.kind}
              current={h.currentValue}
              target={h.targetValue}
              unit={h.unit}
              deadlineLocalTime={h.deadlineLocalTime}
              done={h.done}
              onIncrement={(delta) => increment.mutate({ entryId: h.entryId, delta })}
              onCheck={(done) => check.mutate({ entryId: h.entryId, done })}
            />
          </li>
        ))}
      </ul>
    </>
  );
}
