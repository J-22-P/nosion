'use client';

import { MODULE_KEYS, type CalendarEventDto, type ModuleKey } from '@nosion/contracts';
import { cn, MODULE_THEME } from '@nosion/ui';
import { ChevronLeft, ChevronRight, Link2, Maximize2, Minimize2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { ErrorState } from '@/components/shared/states';
import { Chip } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Skeleton } from '@/components/ui/skeleton';
import { useSession } from '@/features/auth/use-session';
import { DEFAULT_TIME_ZONE } from '@/lib/format';
import { DayPanel, QuickSnapshot } from './day-panel';
import { FeedDialog } from './feed-dialog';
import {
  canMove,
  groupByDate,
  isoWeek,
  monthTitle,
  shiftAnchor,
  todayIn,
  weekDays,
  weekRangeLabel,
  weekSnapshot,
  type CalendarView as View,
} from './grid';
import {
  useCalendar,
  useCalendarState,
  useCompleteFromCalendar,
  useMoveEvent,
  useReopenFromCalendar,
  useServerTiming,
} from './use-calendar';
import { AgendaList, MonthGrid, WeekGrid, WeekStrip } from './views';
import { moduleLabel } from '@/i18n/current';
import { tr } from '@/i18n/current';

const VIEWS = ['month', 'week', 'agenda'] as const satisfies readonly View[];

/**
 * หน้า Calendar (สเปก 8.11.4) — ทุกโมดูลบนปฏิทินเดียวจาก GET /calendar คำขอเดียว
 * desktop: grid (8 col) + day panel (4 col) · มือถือ: แถบสัปดาห์ + agenda (ยังไม่มี mockup มือถือ — ตามที่สเปกกำหนด)
 */
export function CalendarView() {
  const { settings } = useSession();
  const weekStartsOn = settings?.weekStartsOn ?? 1;
  const zoneGuess = settings?.timezone ?? DEFAULT_TIME_ZONE;
  const state = useCalendarState(zoneGuess);
  const calendar = useCalendar(state.view, state.date, weekStartsOn);
  const complete = useCompleteFromCalendar(calendar.range.from, calendar.range.to);
  const reopen = useReopenFromCalendar(calendar.range.from, calendar.range.to);
  const latency = useServerTiming(calendar.dataUpdatedAt);
  const move = useMoveEvent(
    calendar.range.from,
    calendar.range.to,
    calendar.data?.timezone ?? zoneGuess,
  );
  const [feedOpen, setFeedOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // เต็มจอ: ล็อกการเลื่อนของหน้าข้างหลัง · Esc ออก (ถ้า dialog เปิดอยู่ Esc ปิด dialog ก่อน)
  useEffect(() => {
    if (!expanded) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('dialog[open]')) setExpanded(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [expanded]);

  const data = calendar.data;
  const timeZone = data?.timezone ?? zoneGuess;
  const today = todayIn(timeZone);
  const selected = state.date;

  const events = useMemo(() => {
    const all = data?.events ?? [];
    return state.modules ? all.filter((e) => state.modules!.includes(e.module)) : all;
  }, [data, state.modules]);
  const byDate = useMemo(() => groupByDate(events), [events]);
  const reminderDays = useMemo(() => new Set(data?.reminders.map((r) => r.date)), [data]);
  const week = weekDays(selected, weekStartsOn);
  const snapshot = weekSnapshot(data?.events ?? [], week, today);

  const counts = data?.countsByModule ?? {};
  const enabled = MODULE_KEYS.filter((m) => m in counts);
  const total = enabled.reduce((sum, m) => sum + (counts[m] ?? 0), 0);

  function toggleModule(module: ModuleKey) {
    const current = state.modules ?? [];
    const next = current.includes(module)
      ? current.filter((m) => m !== module)
      : [...current, module];
    state.setModules(next.length === 0 || next.length === enabled.length ? null : next);
  }

  function moveEvent(event: CalendarEventDto, toDate: string) {
    if (canMove(event) && event.date !== toDate) move.mutate({ event, toDate });
  }
  /** จากการลาก — ได้ id มา ต้องหา event เต็มจากข้อมูลที่โหลดอยู่ */
  function moveById(eventId: string, toDate: string) {
    const event = data?.events.find((e) => e.id === eventId);
    if (event) moveEvent(event, toDate);
  }

  const gridProps = {
    today,
    selected,
    byDate,
    timeZone,
    onSelect: state.setDate,
  };

  return (
    <div
      className={cn(
        'space-y-5',
        // เต็มจอ: ทับ sidebar/top bar ทั้งหมด (dialog ของ <dialog> อยู่ top layer จึงยังเปิดทับได้)
        expanded && 'fixed inset-0 z-40 overflow-y-auto bg-canvas px-4 py-5 md:px-8 md:py-6',
      )}
    >
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h1 className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[28px] font-semibold leading-tight md:text-[34px]">
            {monthTitle(selected)}
            <span className="font-mono text-sm font-normal text-fg-secondary">
              {weekRangeLabel(calendar.range.days)}
            </span>
          </h1>
          <p className="mt-1 text-sm text-fg-secondary">
            {tr('calendar.subtitle')} <span className="font-mono text-xs">{timeZone}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={
                state.view === 'week' ? tr('calendar.prevWeek') : tr('calendar.prevMonth')
              }
              onClick={() => state.setDate(shiftAnchor(state.view, selected, -1))}
            >
              <ChevronLeft size={16} aria-hidden="true" />
            </Button>
            <Button variant="secondary" size="sm" shape="pill" onClick={() => state.setDate(today)}>
              {tr('calendar.today')}
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={
                state.view === 'week' ? tr('calendar.nextWeek') : tr('calendar.nextMonth')
              }
              onClick={() => state.setDate(shiftAnchor(state.view, selected, 1))}
            >
              <ChevronRight size={16} aria-hidden="true" />
            </Button>
          </div>
          <SegmentedControl
            label={tr('calendar.viewLabel')}
            value={state.view}
            onChange={state.setView}
            options={VIEWS.map((v) => ({ value: v, label: tr(`calendar.view.${v}`) }))}
          />
          <Button
            variant="secondary"
            size="sm"
            shape="pill"
            className="gap-1.5"
            onClick={() => setFeedOpen(true)}
          >
            <Link2 size={14} aria-hidden="true" /> Subscribe iCal
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-pressed={expanded}
            aria-label={expanded ? tr('calendar.exitFullscreen') : tr('calendar.fullscreen')}
            title={expanded ? tr('calendar.exitFullscreen') : tr('calendar.fullscreen')}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? (
              <Minimize2 size={16} aria-hidden="true" />
            ) : (
              <Maximize2 size={16} aria-hidden="true" />
            )}
          </Button>
        </div>
      </header>

      {/* chip ของแต่ละโมดูลมาพร้อมข้อมูล (1 → 4 อัน) — มือถือให้เป็นแถวเดียวเลื่อนแนวนอน ความสูงคงที่
          ไม่งั้นขึ้นบรรทัดใหม่ตอนข้อมูลมาแล้วดันปฏิทินลง (CLS 0.53 · Lighthouse Phase 8) */}
      <div
        role="group"
        aria-label={tr('calendar.filter')}
        className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:flex-wrap md:overflow-visible md:px-0 md:pb-0"
      >
        <Chip selected={state.modules === null} onClick={() => state.setModules(null)}>
          {tr('calendar.all')} <span className="font-mono">{total}</span>
        </Chip>
        {enabled.map((m) => (
          <Chip
            key={m}
            selected={state.modules?.includes(m) ?? false}
            onClick={() => toggleModule(m)}
          >
            <span
              aria-hidden="true"
              className="font-mono"
              style={{ color: MODULE_THEME[m].cssVar }}
            >
              {MODULE_THEME[m].prefix}
            </span>
            {moduleLabel(m)} <span className="font-mono">{counts[m] ?? 0}</span>
          </Chip>
        ))}
      </div>

      {calendar.isError && !data ? (
        <Card>
          <ErrorState message={tr('calendar.loadFailed')} onRetry={() => void calendar.refetch()} />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-12">
          <Card
            className={cn(
              'p-3 md:p-4',
              expanded ? 'lg:col-span-9' : 'lg:col-span-8',
              calendar.isFetching && 'opacity-90',
            )}
          >
            {!data ? (
              <Skeleton className="h-[480px] w-full rounded-row" />
            ) : (
              <>
                {/* มือถือ: แถบสัปดาห์ + agenda ของสัปดาห์ที่เลือก (ทุก view) */}
                <div className="space-y-4 md:hidden">
                  <WeekStrip days={week} {...gridProps} />
                  <AgendaList days={week} {...gridProps} />
                </div>
                <div className="hidden md:block">
                  {state.view === 'month' ? (
                    <MonthGrid
                      days={calendar.range.days}
                      anchor={selected}
                      reminderDays={reminderDays}
                      tall={expanded}
                      events={events}
                      onMove={moveById}
                      {...gridProps}
                    />
                  ) : state.view === 'week' ? (
                    <WeekGrid
                      days={calendar.range.days}
                      events={events}
                      onMove={moveById}
                      {...gridProps}
                    />
                  ) : (
                    <AgendaList
                      days={calendar.range.days.filter(
                        (d) => d.slice(0, 7) === selected.slice(0, 7),
                      )}
                      {...gridProps}
                    />
                  )}
                </div>
              </>
            )}
          </Card>

          <div className={cn('space-y-4', expanded ? 'lg:col-span-3' : 'lg:col-span-4')}>
            {data ? (
              <>
                <DayPanel
                  day={selected}
                  events={byDate.get(selected) ?? []}
                  reminders={data.reminders.filter((r) => r.date === selected)}
                  timeZone={timeZone}
                  onComplete={(id) => complete.mutate(id)}
                  onReopen={(event) => reopen.mutate(event)}
                  onMove={moveEvent}
                />
                <QuickSnapshot snapshot={snapshot} week={`W${isoWeek(selected)}`} />
              </>
            ) : (
              <Skeleton className="h-64 w-full rounded-card" />
            )}
          </div>
        </div>
      )}

      <footer className="flex flex-wrap items-center justify-between gap-3 text-xs text-fg-secondary">
        <ul className="flex flex-wrap gap-3" aria-label={tr('calendar.legend')}>
          {MODULE_KEYS.map((m) => (
            <li key={m} className="flex items-center gap-1">
              <span className="font-mono" style={{ color: MODULE_THEME[m].cssVar }}>
                {MODULE_THEME[m].prefix}
              </span>
              {moduleLabel(m)}
            </li>
          ))}
          <li className="flex items-center gap-1">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-accent" />{' '}
            {tr('calendar.hasReminder')}
          </li>
          <li className="flex items-center gap-1">
            <span
              aria-hidden="true"
              className="inline-block h-2.5 w-4 rounded-[3px] border border-dashed border-hairline-strong"
            />{' '}
            {tr('calendar.projected')}
          </li>
        </ul>
        {latency !== null ? (
          <p className="font-mono" lang="en">
            Sync latency: {latency}ms
          </p>
        ) : null}
      </footer>

      <FeedDialog
        open={feedOpen}
        onClose={() => setFeedOpen(false)}
        month={selected.slice(0, 7)}
        modules={state.modules}
      />
    </div>
  );
}
