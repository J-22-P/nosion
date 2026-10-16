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
import { ApiError } from '@/lib/api-client';
import { DEFAULT_TIME_ZONE } from '@/lib/format';
import { HabitControl, SevenDays } from './habit-control';
import { useCreateHabit, useHabitProgress, useHabitRule, useHabits } from './use-habits';

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
            title="ยังไม่ได้เปิดโมดูลนิสัย"
            description="เปิดแล้วนิสัยจะขึ้นในหน้าวันนี้ ปฏิทิน สรุปสัปดาห์ และพิมพ์สร้างจาก ⌘K ได้ทันที"
            aside={
              <Button
                size="sm"
                shape="pill"
                disabled={modules.pending}
                onClick={() => modules.setEnabled('habit', true)}
              >
                เปิดใช้นิสัย
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
        summary={habits.data ? `วันนี้ทำแล้ว ${doneToday} จาก ${withToday}` : undefined}
        action={
          <Button shape="pill" size="sm" className="gap-1.5" onClick={() => setFormOpen(true)}>
            <Plus size={14} aria-hidden="true" /> สร้างนิสัยแบบละเอียด
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
          <ErrorState
            message="โหลดนิสัยไม่สำเร็จ ลองใหม่อีกครั้ง"
            onRetry={() => void habits.refetch()}
          />
        </Card>
      ) : list.length === 0 ? (
        <Card>
          <EmptyState
            title="ยังไม่มีนิสัย"
            description='พิมพ์ด้านบน เช่น "ดื่มน้ำ 8 แก้ว ทุกวัน" หรือ "วิ่ง 3 ครั้งต่อสัปดาห์"'
          />
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
          นิสัย{' '}
          <span className="font-normal text-fg-secondary" lang="en">
            (Habits)
          </span>
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
                ? `${habit.weeklyTarget} ครั้งต่อสัปดาห์`
                : habit.kind === 'count'
                  ? `วันละ ${habit.targetValue} ${habit.unit}`
                  : 'ทุกวัน',
            ]
              .filter(Boolean)
              .join(' · ') || undefined
          }
          aside={
            <div className="flex items-center gap-1">
              {habit.streak.current > 0 ? (
                <Badge
                  tone="neutral"
                  aria-label={`ต่อเนื่อง ${habit.streak.current} ${habit.streak.unit === 'week' ? 'สัปดาห์' : 'วัน'}`}
                >
                  <Flame aria-hidden="true" /> {habit.streak.current}
                </Badge>
              ) : null}
              <Menu
                label={`ตัวเลือกของ ${habit.title}`}
                trigger={<MoreHorizontal size={18} aria-hidden="true" />}
                items={[
                  {
                    label: habit.isPaused ? 'ทำต่อ' : 'หยุดไว้ก่อน',
                    icon: habit.isPaused ? <Play /> : <Pause />,
                    onSelect: () =>
                      rule.pause.mutate({ ruleId: habit.ruleId, paused: !habit.isPaused }),
                  },
                  {
                    label: 'ลบนิสัย',
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
            <p className="text-sm text-fg-secondary">หยุดไว้ — ไม่มีรอบใหม่จนกว่าจะกดทำต่อ</p>
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
            <p className="text-sm text-fg-secondary">วันนี้ไม่มีรอบของนิสัยนี้</p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <SevenDays days={habit.last7} />
            <p className="text-xs text-fg-secondary">
              {habit.weekProgress
                ? `สัปดาห์นี้ ${habit.weekProgress.done}/${habit.weekProgress.target} · `
                : ''}
              ยาวสุด {habit.streak.longest} {habit.streak.unit === 'week' ? 'สัปดาห์' : 'วัน'}
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
      toast.success('สร้างนิสัยแล้ว', { description: entry.title });
      setText('');
      void queryClient.invalidateQueries({ queryKey: ['entries'] });
    },
    onError: (error) =>
      toast.error('สร้างนิสัยไม่สำเร็จ', {
        description: error instanceof ApiError ? error.message : undefined,
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
          aria-label="สร้างนิสัยใหม่ด้วยข้อความ"
          placeholder="เช่น ดื่มน้ำ 8 แก้ว ทุกวัน · นอนก่อน 23:45 ทุกวัน · วิ่ง 3 ครั้งต่อสัปดาห์"
          maxLength={200}
          className="h-11 min-w-0 flex-1 bg-transparent text-[15px] text-fg outline-none placeholder:text-fg-tertiary"
        />
        <Button type="submit" disabled={!text.trim() || create.isPending} className="shrink-0">
          สร้าง
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

const KIND_OPTIONS: { value: HabitKind; label: string }[] = [
  { value: 'check', label: 'ทำ / ไม่ทำ (ติ๊กครั้งเดียว)' },
  { value: 'count', label: 'นับจำนวน (มีปุ่ม −1 / +1)' },
  { value: 'before_time', label: 'ต้องทำก่อนเวลา' },
];

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
          สร้างนิสัย
        </h2>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="ปิด">
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
  const [unit, setUnit] = useState('แก้ว');
  const [deadline, setDeadline] = useState('23:00');
  const [cadence, setCadence] = useState<'daily' | 'weekly'>('daily');
  const [weekly, setWeekly] = useState('3');
  const [touched, setTouched] = useState(false);

  const targetValue = Number(target);
  const weeklyTarget = Number(weekly);
  const errors = {
    title: title.trim() ? undefined : 'ใส่ชื่อนิสัย',
    target:
      kind !== 'count' || (targetValue > 0 && Number.isFinite(targetValue))
        ? undefined
        : 'เป้าต้องมากกว่า 0',
    weekly:
      cadence === 'daily' ||
      (Number.isInteger(weeklyTarget) && weeklyTarget >= 1 && weeklyTarget <= 7)
        ? undefined
        : '1–7 ครั้ง',
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
            unit: kind === 'count' ? unit.trim() || 'ครั้ง' : 'ครั้ง',
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
        <Label htmlFor={`${id}-title`}>ชื่อนิสัย</Label>
        <Input
          id={`${id}-title`}
          data-autofocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="เช่น ดื่มน้ำ"
          maxLength={200}
          aria-invalid={touched && !!errors.title}
        />
        <FieldError>{touched ? errors.title : undefined}</FieldError>
      </div>
      <div>
        <Label htmlFor={`${id}-subtitle`}>คำอธิบายสั้น (ไม่บังคับ)</Label>
        <Input
          id={`${id}-subtitle`}
          value={subtitle}
          onChange={(e) => setSubtitle(e.target.value)}
          maxLength={80}
        />
      </div>
      <div>
        <Label htmlFor={`${id}-kind`}>แบบ</Label>
        <Select
          id={`${id}-kind`}
          value={kind}
          onChange={(e) => setKind(e.target.value as HabitKind)}
          className="w-full"
        >
          {KIND_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </div>
      {kind === 'count' ? (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor={`${id}-target`}>เป้าต่อวัน</Label>
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
            <Label htmlFor={`${id}-unit`}>หน่วย</Label>
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
          <Label htmlFor={`${id}-deadline`}>ต้องทำก่อน</Label>
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
          <Label htmlFor={`${id}-cadence`}>ความถี่</Label>
          <Select
            id={`${id}-cadence`}
            value={cadence}
            onChange={(e) => setCadence(e.target.value as 'daily' | 'weekly')}
            className="w-full"
          >
            <option value="daily">ทุกวัน</option>
            <option value="weekly">กี่ครั้งต่อสัปดาห์</option>
          </Select>
        </div>
        {cadence === 'weekly' ? (
          <div>
            <Label htmlFor={`${id}-weekly`}>ครั้งต่อสัปดาห์</Label>
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
          ยกเลิก
        </Button>
        <Button type="submit" disabled={create.isPending}>
          สร้างนิสัย
        </Button>
      </div>
    </form>
  );
}
