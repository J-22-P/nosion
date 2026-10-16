'use client';

import type { CalendarEventDto, CalendarReminderDto } from '@nosion/contracts';
import { MODULE_THEME } from '@nosion/ui';
import { Bell } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { baht } from '@/features/expenses/format';
import { longDayLabel, timeOf, type WeekSnapshot } from './grid';
import { MODULE_ICON } from './views';

const REMINDER_STATUS: Record<CalendarReminderDto['status'], string> = {
  scheduled: 'รอส่ง',
  sent: 'ส่งแล้ว',
  failed: 'ส่งไม่สำเร็จ',
  cancelled: 'ยกเลิก',
};
const CHANNEL: Record<CalendarReminderDto['channel'], string> = {
  push: 'Push',
  email: 'อีเมล',
  webhook: 'Webhook',
};

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
}: {
  day: string;
  events: CalendarEventDto[];
  reminders: CalendarReminderDto[];
  timeZone: string;
  onComplete: (entryId: string) => void;
}) {
  return (
    <Card>
      <CardHeader
        title={longDayLabel(day)}
        description={events.length ? `${events.length} รายการ` : 'ไม่มีรายการ'}
      />
      <CardContent className="space-y-3">
        {reminders.length ? (
          <ul className="flex flex-wrap gap-1.5" aria-label="การเตือนของวันนี้">
            {reminders.map((r) => (
              <li key={`${r.entryId}-${r.fireAt}`}>
                <Badge tone={r.status === 'failed' ? 'danger' : 'outline'} mono>
                  <Bell aria-hidden="true" /> {CHANNEL[r.channel]} {timeOf(r.fireAt, timeZone)} ·{' '}
                  {REMINDER_STATUS[r.status]}
                </Badge>
              </li>
            ))}
          </ul>
        ) : null}

        {events.length === 0 ? (
          <p className="py-6 text-center text-sm text-fg-secondary">ว่าง — ไม่มีอะไรต้องทำวันนี้</p>
        ) : (
          <ol className="relative space-y-2 border-l border-hairline pl-4">
            {events.map((event) => (
              <DayEvent key={event.id} event={event} timeZone={timeZone} onComplete={onComplete} />
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
}: {
  event: CalendarEventDto;
  timeZone: string;
  onComplete: (entryId: string) => void;
}) {
  const theme = MODULE_THEME[event.module];
  const Icon = MODULE_ICON[event.module];
  const done = event.status === 'done';
  const badge = typeof event.meta.badge === 'string' ? event.meta.badge : null;
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
              aria-label={`${a.label}: ${event.title}`}
              onCheckedChange={() => event.entryId && onComplete(event.entryId)}
              className="mt-0.5"
            />
          ))}
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-1.5 text-xs text-fg-secondary">
            <Icon size={13} aria-hidden="true" />
            <span>{theme.label}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono">
              {event.allDay ? 'ทั้งวัน' : timeOf(event.start, timeZone)}
            </span>
            {event.ruleId ? <span title="เกิดซ้ำ">↻</span> : null}
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
            {event.projected ? <Badge tone="outline">รอบล่วงหน้า · ยังไม่ถูกสร้าง</Badge> : null}
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
                  {a.label}
                </Button>
              ))}
            {event.actions
              .filter((a) => a.kind === 'open')
              .map((a) =>
                a.kind === 'open' ? (
                  <Link key={a.label} href={a.href} className="text-xs text-accent hover:underline">
                    {a.label}
                  </Link>
                ) : null,
              )}
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
      <CardHeader title="Quick Snapshot" description={`สถิติสัปดาห์ ${week}`} />
      <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        <div className="rounded-row bg-sunken p-4">
          <p className="text-xs text-fg-secondary">งานค้าง</p>
          <p className="mt-1 font-mono text-xl font-semibold">
            {snapshot.tasksTotal - snapshot.tasksDone}
            <span className="text-sm font-normal text-fg-secondary">
              {' '}
              · เสร็จ {snapshot.tasksDone}/{snapshot.tasksTotal}
            </span>
          </p>
          <Progress
            value={snapshot.tasksDone}
            max={Math.max(snapshot.tasksTotal, 1)}
            label="งานที่เสร็จในสัปดาห์"
            className="mt-2"
          />
        </div>
        <div className="rounded-row bg-sunken p-4">
          <p className="text-xs text-fg-secondary">บิลครบกำหนด</p>
          <p className="mt-1 font-mono text-xl font-semibold">
            {baht(snapshot.dueMinor, snapshot.currency)}
          </p>
          <p className="mt-1 text-xs text-fg-secondary">
            {snapshot.nextDueInDays === null
              ? 'ไม่มีบิลค้างจ่าย'
              : snapshot.nextDueInDays === 0
                ? 'ถัดไป: วันนี้'
                : `ถัดไปอีก ${snapshot.nextDueInDays} วัน`}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
