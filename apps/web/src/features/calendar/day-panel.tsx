'use client';

import type { CalendarActionDto, CalendarEventDto, CalendarReminderDto } from '@nosion/contracts';
import { MODULE_THEME } from '@nosion/ui';
import { Bell, CalendarClock } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { baht } from '@/features/expenses/format';
import { canMove, longDayLabel, timeOf, type WeekSnapshot } from './grid';
import { MODULE_ICON } from './views';
import { tr } from '@/i18n/current';
import { moduleLabel } from '@/i18n/current';

/** ปุ่มของโมดูลมีชื่อมาจาก API (ภาษาไทยเสมอ — calendarActions ไม่รู้ภาษาผู้ใช้) → ใช้คำแปลตามโมดูล+ชนิด */
const ACTION_KEYS = new Set(['task.complete', 'expense.complete', 'habit.complete', 'habit.open']);
function actionLabel(module: CalendarEventDto['module'], action: CalendarActionDto): string {
  const key = `${module}.${action.kind}`;
  return ACTION_KEYS.has(key) ? tr(`calendarAction.${key}`) : action.label;
}

/** ป้ายสถานะ — แปลจาก meta.badgeKey ถ้ามี (API รุ่นใหม่) · ไม่มีก็ใช้ข้อความเดิม */
function badgeOf(event: CalendarEventDto): string | null {
  const key = event.meta.badgeKey;
  if (key === 'paid' || key === 'due' || key === 'done') return tr(`calendarBadge.${key}`);
  if (key === 'before')
    return tr('calendarBadge.before', { time: String(event.meta.deadline ?? '') });
  return typeof event.meta.badge === 'string' ? event.meta.badge : null;
}

const channelLabel = (channel: CalendarReminderDto['channel']) =>
  channel === 'email' ? tr('dayPanel.channel.email') : channel === 'push' ? 'Push' : 'Webhook';

/**
 * Day panel (สเปก 8.11.4) — timeline ของวันที่เลือก · หัวแสดงการเตือนของวัน
 * ปุ่มของแต่ละการ์ดมาจาก `actions` ที่โมดูลส่งมา (calendarActions) — หน้านี้แค่วาดตามชนิด ไม่ hard-code ว่าโมดูลไหนมีปุ่มอะไร
 */
export function DayPanel({
  day,
  events,
  reminders,
  timeZone,
  onComplete,
  onMove,
}: {
  day: string;
  events: CalendarEventDto[];
  reminders: CalendarReminderDto[];
  timeZone: string;
  onComplete: (entryId: string) => void;
  onMove: (event: CalendarEventDto, toDate: string) => void;
}) {
  return (
    <Card>
      <CardHeader
        title={longDayLabel(day)}
        description={
          events.length ? tr('calendar.dayItems', { count: events.length }) : tr('calendar.noItems')
        }
      />
      <CardContent className="space-y-3">
        {reminders.length ? (
          <ul className="flex flex-wrap gap-1.5" aria-label={tr('dayPanel.remindersToday')}>
            {reminders.map((r) => (
              <li key={`${r.entryId}-${r.fireAt}`}>
                <Badge tone={r.status === 'failed' ? 'danger' : 'outline'} mono>
                  <Bell aria-hidden="true" /> {channelLabel(r.channel)} {timeOf(r.fireAt, timeZone)}{' '}
                  · {tr(`dayPanel.reminder.${r.status}`)}
                </Badge>
              </li>
            ))}
          </ul>
        ) : null}

        {events.length === 0 ? (
          <p className="py-6 text-center text-sm text-fg-secondary">{tr('dayPanel.empty')}</p>
        ) : (
          <ol className="relative space-y-2 border-l border-hairline pl-4">
            {events.map((event) => (
              <DayEvent
                key={event.id}
                event={event}
                timeZone={timeZone}
                onComplete={onComplete}
                onMove={onMove}
              />
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

function DayEvent({
  event,
  timeZone,
  onComplete,
  onMove,
}: {
  event: CalendarEventDto;
  timeZone: string;
  onComplete: (entryId: string) => void;
  onMove: (event: CalendarEventDto, toDate: string) => void;
}) {
  const theme = MODULE_THEME[event.module];
  const Icon = MODULE_ICON[event.module];
  const done = event.status === 'done';
  const badge = badgeOf(event);
  const deepLink = typeof event.meta.deepLink === 'string' ? event.meta.deepLink : null;
  const title = (
    <span className={done ? 'text-fg-secondary line-through' : undefined}>{event.title}</span>
  );

  return (
    <li className="relative rounded-row bg-sunken p-3">
      <span
        aria-hidden="true"
        className="absolute -left-[21px] top-4 size-2.5 rounded-full border-2 border-surface"
        style={{ background: theme.cssVar }}
      />
      <div className="flex items-start gap-3">
        {event.actions
          .filter((a) => a.kind === 'complete' && a.presentation === 'checkbox')
          .map((a) => (
            <Checkbox
              key={a.label}
              checked={done}
              aria-label={`${actionLabel(event.module, a)}: ${event.title}`}
              onCheckedChange={() => event.entryId && onComplete(event.entryId)}
              className="mt-0.5"
            />
          ))}
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-1.5 text-xs text-fg-secondary">
            <Icon size={13} aria-hidden="true" />
            <span>{moduleLabel(event.module)}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono">
              {event.allDay ? tr('calendar.allDay') : timeOf(event.start, timeZone)}
            </span>
            {event.ruleId ? <span title={tr('dayPanel.recurring')}>↻</span> : null}
          </p>
          <p className="mt-0.5 text-sm font-medium">
            {deepLink && !event.projected ? (
              <Link href={deepLink} className="hover:underline">
                {title}
              </Link>
            ) : (
              title
            )}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {badge ? <Badge tone={done ? 'success' : 'neutral'}>{badge}</Badge> : null}
            {event.projected ? <Badge tone="outline">{tr('dayPanel.projected')}</Badge> : null}
            {event.actions
              .filter((a) => a.kind === 'complete' && a.presentation === 'button')
              .map((a) => (
                <Button
                  key={a.label}
                  size="sm"
                  variant="secondary"
                  shape="pill"
                  onClick={() => event.entryId && onComplete(event.entryId)}
                >
                  {actionLabel(event.module, a)}
                </Button>
              ))}
            {event.actions
              .filter((a) => a.kind === 'open')
              .map((a) =>
                a.kind === 'open' ? (
                  <Link key={a.label} href={a.href} className="text-xs text-accent hover:underline">
                    {actionLabel(event.module, a)}
                  </Link>
                ) : null,
              )}
            {canMove(event) ? (
              <label className="ml-auto inline-flex items-center gap-1 text-xs text-fg-secondary">
                <CalendarClock size={13} aria-hidden="true" />
                <span className="sr-only">{tr('dayPanel.moveTo', { title: event.title })}</span>
                {/* ทางเลือกของการลาก — คีย์บอร์ดและมือถือ (ลาก HTML5 ใช้นิ้วไม่ได้) */}
                <input
                  type="date"
                  value={event.date}
                  onChange={(e) => {
                    if (e.target.value && e.target.value !== event.date)
                      onMove(event, e.target.value);
                  }}
                  className="h-7 rounded-control border border-hairline bg-transparent px-1.5 font-mono text-xs text-fg"
                />
              </label>
            ) : null}
          </div>
        </div>
      </div>
    </li>
  );
}

/** Quick Snapshot ของสัปดาห์ที่เลือก (สเปก 8.11.4) */
export function QuickSnapshot({ snapshot, week }: { snapshot: WeekSnapshot; week: string }) {
  return (
    <Card>
      <CardHeader title="Quick Snapshot" description={tr('dayPanel.weekStats', { week })} />
      <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        <div className="rounded-row bg-sunken p-4">
          <p className="text-xs text-fg-secondary">{tr('dayPanel.openTasks')}</p>
          <p className="mt-1 font-mono text-xl font-semibold">
            {snapshot.tasksTotal - snapshot.tasksDone}
            <span className="text-sm font-normal text-fg-secondary">
              {' '}
              {tr('dayPanel.doneOf', { done: snapshot.tasksDone, total: snapshot.tasksTotal })}
            </span>
          </p>
          <Progress
            value={snapshot.tasksDone}
            max={Math.max(snapshot.tasksTotal, 1)}
            label={tr('dayPanel.weekProgress')}
            className="mt-2"
          />
        </div>
        <div className="rounded-row bg-sunken p-4">
          <p className="text-xs text-fg-secondary">{tr('dayPanel.billsDue')}</p>
          <p className="mt-1 font-mono text-xl font-semibold">
            {baht(snapshot.dueMinor, snapshot.currency)}
          </p>
          <p className="mt-1 text-xs text-fg-secondary">
            {snapshot.nextDueInDays === null
              ? tr('dayPanel.noBills')
              : snapshot.nextDueInDays === 0
                ? tr('dayPanel.nextToday')
                : tr('dayPanel.nextInDays', { days: snapshot.nextDueInDays })}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
