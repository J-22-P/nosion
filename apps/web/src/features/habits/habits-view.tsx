'use client';

import type { HabitDto, HabitKind } from '@nosion/contracts';
import { parseNaturalText } from '@nosion/core/nl';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Flame, MoreHorizontal, Pause, Play, Plus, Repeat, Trash2, X } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { EmptyState, ErrorState } from '@/components/shared/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { FieldError, Input, Label, Select } from '@/components/ui/input';
import { Menu } from '@/components/ui/menu';
import { Skeleton } from '@/components/ui/skeleton';
import { useSession } from '@/features/auth/use-session';
import { todayIn } from '@/features/calendar/grid';
import { buildChips, rawFor, replaceSpan } from '@/features/capture/nl-chips';
import { ParsedChips } from '@/features/capture/parsed-chips';
import { parseApi } from '@/features/command-palette/api';
import { useEnabledModules } from '@/features/settings/use-modules';
import { DEFAULT_TIME_ZONE } from '@/lib/format';
import { HabitControl, SevenDays } from './habit-control';
import { useCreateHabit, useHabitProgress, useHabitRule, useHabits } from './use-habits';
import { errorText } from '@/i18n/errors';
import { currentLocale, tr } from '@/i18n/current';

/**
 * หน้านิสัย (สเปก 8.1 `/habits` · Phase 6) — ยังไม่มี mockup: ประกอบจาก token + component ใน 8.7
 * ตาม pattern ของหน้าที่มี mockup (หัวหน้า → แถบบันทึกด่วน → การ์ด grid)
 */
export function HabitsView() {
  const modules = useEnabledModules();
  const habits = useHabits();
  const params = useSearchParams();
  const [formOpen, setFormOpen] = useState(params.get('new') === '1');

  if (modules.loaded && !modules.isEnabled('habit')) {
    return (
      <div className="space-y-6">
        <Header />
        <Card>
          <CardHeader
            icon={<Repeat />}
            title={tr('habits.moduleOff')}
            description={tr('habits.moduleOffHint')}
            aside={
              <Button
                size="sm"
                shape="pill"
                disabled={modules.pending}
                onClick={() => modules.setEnabled('habit', true)}
              >
                {tr('habits.enable')}
              </Button>
            }
          />
        </Card>
      </div>
    );
  }

  const list = habits.data?.habits ?? [];
  const active = list.filter((h) => !h.isPaused);
  const doneToday = active.filter((h) => h.today?.status === 'done').length;
  const withToday = active.filter((h) => h.today).length;

  return (
    <div className="space-y-6">
      <Header
        summary={
          habits.data ? tr('habits.summary', { done: doneToday, total: withToday }) : undefined
        }
        action={
          <Button shape="pill" size="sm" className="gap-1.5" onClick={() => setFormOpen(true)}>
            <Plus size={14} aria-hidden="true" /> {tr('habits.detailed')}
          </Button>
        }
      />
      <HabitCapture />

      {habits.isPending ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-40 rounded-card" />
          <Skeleton className="h-40 rounded-card" />
        </div>
      ) : habits.isError ? (
        <Card>
          <ErrorState message={tr('habits.loadFailed')} onRetry={() => void habits.refetch()} />
        </Card>
      ) : list.length === 0 ? (
        <Card>
          <EmptyState title={tr('habits.empty')} description={tr('habits.emptyHint')} />
        </Card>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {list.map((h) => (
            <HabitCard key={h.ruleId} habit={h} />
          ))}
        </ul>
      )}

      <HabitFormDialog open={formOpen} onClose={() => setFormOpen(false)} />
    </div>
  );
}

function Header({ summary, action }: { summary?: string; action?: React.ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-[28px] font-semibold leading-tight md:text-[34px]">
          {tr('habits.title')}
          {currentLocale() === 'th' ? (
            <>
              {' '}
              <span className="font-normal text-fg-secondary" lang="en">
                (Habits)
              </span>
            </>
          ) : null}
        </h1>
        {summary ? <p className="mt-1 text-sm text-fg-secondary">{summary}</p> : null}
      </div>
      {action}
    </header>
  );
}

function HabitCard({ habit }: { habit: HabitDto }) {
  const { increment, check } = useHabitProgress();
  const rule = useHabitRule();
  const today = habit.today;
  const done = today?.status === 'done';

  return (
    <li>
      <Card className={habit.isPaused ? 'opacity-70' : undefined}>
        <CardHeader
          icon={<Repeat />}
          title={habit.title}
          description={
            [
              habit.subtitle,
              habit.cadence === 'weekly'
                ? tr('habits.perWeek', { count: habit.weeklyTarget ?? 0 })
                : habit.kind === 'count'
                  ? tr('habits.perDay', { target: habit.targetValue, unit: habit.unit })
                  : tr('habits.daily'),
            ]
              .filter(Boolean)
              .join(' · ') || undefined
          }
          aside={
            <div className="flex items-center gap-1">
              {habit.streak.current > 0 ? (
                <Badge
                  tone="neutral"
                  aria-label={tr('habits.streak', {
                    count: habit.streak.current,
                    unit: tr(`habits.unit.${habit.streak.unit === 'week' ? 'week' : 'day'}`),
                  })}
                >
                  <Flame aria-hidden="true" /> {habit.streak.current}
                </Badge>
              ) : null}
              <Menu
                label={tr('habits.options', { title: habit.title })}
                trigger={<MoreHorizontal size={18} aria-hidden="true" />}
                items={[
                  {
                    label: habit.isPaused ? tr('habits.resume') : tr('habits.pause'),
                    icon: habit.isPaused ? <Play /> : <Pause />,
                    onSelect: () =>
                      rule.pause.mutate({ ruleId: habit.ruleId, paused: !habit.isPaused }),
                  },
                  {
                    label: tr('habits.delete'),
                    icon: <Trash2 />,
                    tone: 'danger',
                    onSelect: () => rule.remove.mutate(habit.ruleId),
                  },
                ]}
              />
            </div>
          }
        />
        <CardContent className="space-y-4">
          {habit.isPaused ? (
            <p className="text-sm text-fg-secondary">{tr('habits.paused')}</p>
          ) : today ? (
            <HabitControl
              title={habit.title}
              kind={habit.kind}
              current={today.currentValue}
              target={habit.targetValue}
              unit={habit.unit}
              deadlineLocalTime={habit.deadlineLocalTime}
              done={done}
              onIncrement={(delta) => increment.mutate({ entryId: today.entryId, delta })}
              onCheck={(value) =>
                check.mutate({ entryId: today.entryId, done: value, title: habit.title })
              }
            />
          ) : (
            <p className="text-sm text-fg-secondary">{tr('habits.noneToday')}</p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <SevenDays days={habit.last7} />
            <p className="text-xs text-fg-secondary">
              {habit.weekProgress
                ? tr('habits.thisWeek', {
                    done: habit.weekProgress.done,
                    target: habit.weekProgress.target,
                  })
                : ''}
              {tr('habits.longest', {
                count: habit.streak.longest,
                unit: habit.streak.unit === 'week' ? 'week' : 'day',
              })}
            </p>
          </div>
        </CardContent>
      </Card>
    </li>
  );
}

/** สร้างนิสัยด้วยประโยคเดียว — parser เดียวกับ ⌘K · บังคับโมดูลนิสัย (`module: habit`) */
function HabitCapture() {
  const [text, setText] = useState('');
  const { settings } = useSession();
  const timeZone = settings?.timezone ?? DEFAULT_TIME_ZONE;
  const queryClient = useQueryClient();
  const nl = useMemo(() => parseNaturalText(text, { now: new Date(), timeZone }), [text, timeZone]);
  const chips = buildChips(nl, ['recurrence', 'quantity', 'time'], todayIn(timeZone));

  const create = useMutation({
    mutationFn: () => parseApi.commit({ text: text.trim(), module: 'habit' }),
    onSuccess: ({ entry }) => {
      toast.success(tr('habits.created'), { description: entry.title });
      setText('');
      void queryClient.invalidateQueries({ queryKey: ['entries'] });
    },
    onError: (error) =>
      toast.error(tr('habits.createFailed'), {
        description: errorText(error),
      }),
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim() && !create.isPending) create.mutate();
      }}
      className="rounded-card border border-hairline bg-surface p-2 shadow-card transition-shadow focus-within:shadow-[var(--focus-ring)]"
    >
      <div className="flex items-center gap-2">
        <Repeat size={18} className="ml-2 shrink-0 text-fg-secondary" aria-hidden="true" />
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setText('');
          }}
          data-shortcut="new"
          aria-label={tr('habits.quickLabel')}
          placeholder={tr('habits.quickPlaceholder')}
          maxLength={200}
          className="h-11 min-w-0 flex-1 bg-transparent text-[15px] text-fg outline-none placeholder:text-fg-tertiary"
        />
        <Button type="submit" disabled={!text.trim() || create.isPending} className="shrink-0">
          {tr('habits.create')}
        </Button>
      </div>
      <ParsedChips
        chips={chips}
        onReplace={(chip, raw) =>
          setText((t) => replaceSpan(t, chip.start, chip.end, rawFor(chip.kind, raw)))
        }
      />
    </form>
  );
}

const KINDS: HabitKind[] = ['check', 'count', 'before_time'];

/** ฟอร์มละเอียด — สร้างกฎการเกิดซ้ำ (POST /recurrence-rules) ที่ template เป็นนิสัย */
function HabitFormDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={() => {
        if (!ref.current?.open) onClose();
      }}
      aria-labelledby="habit-form-title"
      className="m-auto max-h-[calc(100dvh-32px)] w-[min(560px,calc(100vw-32px))] overflow-y-auto rounded-panel border border-hairline bg-surface p-0 text-fg shadow-float backdrop:bg-black/40"
    >
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-hairline bg-surface px-5 py-4">
        <h2 id="habit-form-title" className="text-base font-semibold">
          {tr('habits.formTitle')}
        </h2>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label={tr('habits.close')}>
          <X size={16} aria-hidden="true" />
        </Button>
      </div>
      {open ? <HabitForm onDone={onClose} /> : null}
    </dialog>
  );
}

function HabitForm({ onDone }: { onDone: () => void }) {
  const id = useId();
  const { settings } = useSession();
  const create = useCreateHabit();
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [kind, setKind] = useState<HabitKind>('check');
  const [target, setTarget] = useState('8');
  const [unit, setUnit] = useState(() => tr('habits.defaultUnit'));
  const [deadline, setDeadline] = useState('23:00');
  const [cadence, setCadence] = useState<'daily' | 'weekly'>('daily');
  const [weekly, setWeekly] = useState('3');
  const [touched, setTouched] = useState(false);

  const targetValue = Number(target);
  const weeklyTarget = Number(weekly);
  const errors = {
    title: title.trim() ? undefined : tr('habits.needTitle'),
    target:
      kind !== 'count' || (targetValue > 0 && Number.isFinite(targetValue))
        ? undefined
        : tr('habits.needTarget'),
    weekly:
      cadence === 'daily' ||
      (Number.isInteger(weeklyTarget) && weeklyTarget >= 1 && weeklyTarget <= 7)
        ? undefined
        : tr('habits.weeklyRange'),
  };

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (errors.title || errors.target || errors.weekly || create.isPending) return;
    create.mutate(
      {
        rrule: 'FREQ=DAILY',
        startsAt: todayIn(settings?.timezone ?? DEFAULT_TIME_ZONE),
        template: {
          module: 'habit',
          title: title.trim(),
          isAllDay: true,
          payload: {
            kind,
            targetValue: kind === 'count' ? targetValue : 1,
            unit: kind === 'count' ? unit.trim() || tr('habits.timesUnit') : tr('habits.timesUnit'),
            deadlineLocalTime: kind === 'before_time' ? deadline : null,
            subtitle: subtitle.trim() || null,
            cadence,
            weeklyTarget: cadence === 'weekly' ? weeklyTarget : null,
          },
        },
      },
      { onSuccess: onDone },
    );
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4 p-5">
      <div>
        <Label htmlFor={`${id}-title`}>{tr('habits.name')}</Label>
        <Input
          id={`${id}-title`}
          data-autofocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={tr('habits.namePlaceholder')}
          maxLength={200}
          aria-invalid={touched && !!errors.title}
        />
        <FieldError>{touched ? errors.title : undefined}</FieldError>
      </div>
      <div>
        <Label htmlFor={`${id}-subtitle`}>{tr('habits.subtitle')}</Label>
        <Input
          id={`${id}-subtitle`}
          value={subtitle}
          onChange={(e) => setSubtitle(e.target.value)}
          maxLength={80}
        />
      </div>
      <div>
        <Label htmlFor={`${id}-kind`}>{tr('habits.kindLabel')}</Label>
        <Select
          id={`${id}-kind`}
          value={kind}
          onChange={(e) => setKind(e.target.value as HabitKind)}
          className="w-full"
        >
          {KINDS.map((k) => (
            <option key={k} value={k}>
              {tr(`habits.kind.${k}`)}
            </option>
          ))}
        </Select>
      </div>
      {kind === 'count' ? (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor={`${id}-target`}>{tr('habits.dailyTarget')}</Label>
            <Input
              id={`${id}-target`}
              inputMode="decimal"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="font-mono"
              aria-invalid={touched && !!errors.target}
            />
            <FieldError>{touched ? errors.target : undefined}</FieldError>
          </div>
          <div>
            <Label htmlFor={`${id}-unit`}>{tr('habits.unitLabel')}</Label>
            <Input
              id={`${id}-unit`}
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              maxLength={20}
            />
          </div>
        </div>
      ) : null}
      {kind === 'before_time' ? (
        <div>
          <Label htmlFor={`${id}-deadline`}>{tr('habits.deadline')}</Label>
          <Input
            id={`${id}-deadline`}
            type="time"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            className="font-mono"
          />
        </div>
      ) : null}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor={`${id}-cadence`}>{tr('habits.cadence')}</Label>
          <Select
            id={`${id}-cadence`}
            value={cadence}
            onChange={(e) => setCadence(e.target.value as 'daily' | 'weekly')}
            className="w-full"
          >
            <option value="daily">{tr('habits.cadenceDaily')}</option>
            <option value="weekly">{tr('habits.cadenceWeekly')}</option>
          </Select>
        </div>
        {cadence === 'weekly' ? (
          <div>
            <Label htmlFor={`${id}-weekly`}>{tr('habits.timesPerWeek')}</Label>
            <Input
              id={`${id}-weekly`}
              inputMode="numeric"
              value={weekly}
              onChange={(e) => setWeekly(e.target.value)}
              className="font-mono"
              aria-invalid={touched && !!errors.weekly}
            />
            <FieldError>{touched ? errors.weekly : undefined}</FieldError>
          </div>
        ) : null}
      </div>
      <div className="flex justify-end gap-2 border-t border-hairline pt-4">
        <Button type="button" variant="ghost" onClick={onDone}>
          {tr('habits.cancel')}
        </Button>
        <Button type="submit" disabled={create.isPending}>
          {tr('habits.formTitle')}
        </Button>
      </div>
    </form>
  );
}
