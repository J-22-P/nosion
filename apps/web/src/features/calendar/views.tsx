'use client';

import type { CalendarEventDto, ModuleKey } from '@nosion/contracts';
import { cn, MODULE_THEME } from '@nosion/ui';
import { CircleCheck, Dumbbell, Repeat, Wallet, type LucideIcon } from 'lucide-react';
import { longDayLabel, sameMonth, TH_WEEKDAYS_SHORT, timeOf, weekdayOf } from './grid';

export const MODULE_ICON: Record<ModuleKey, LucideIcon> = {
  task: CircleCheck,
  expense: Wallet,
  workout: Dumbbell,
  habit: Repeat,
};

/** รายการในช่องปฏิทิน — prefix โมดูล (T: E: W: H:) ไม่พึ่งสีอย่างเดียว (สเปก 8.7.2) */
function EventLine({ event, timeZone }: { event: CalendarEventDto; timeZone: string }) {
  const theme = MODULE_THEME[event.module];
  return (
    <span
      className={cn(
        'flex min-w-0 items-center gap-1 rounded-[6px] px-1.5 py-0.5 text-[11px] leading-tight',
        event.status === 'done' ? 'text-fg-secondary line-through' : 'text-fg',
        event.projected ? 'border border-dashed border-hairline-strong' : 'bg-wash',
      )}
    >
      <span className="shrink-0 font-mono" style={{ color: theme.cssVar }}>
        {theme.prefix}
      </span>
      {event.allDay ? null : (
        <span className="shrink-0 font-mono text-fg-secondary">
          {timeOf(event.start, timeZone)}
        </span>
      )}
      <span className="truncate">{event.title}</span>
    </span>
  );
}

const MAX_IN_CELL = 3;

export function MonthGrid({
  days,
  anchor,
  today,
  selected,
  byDate,
  reminderDays,
  timeZone,
  onSelect,
}: {
  days: string[];
  anchor: string;
  today: string;
  selected: string;
  byDate: Map<string, CalendarEventDto[]>;
  reminderDays: Set<string>;
  timeZone: string;
  onSelect: (day: string) => void;
}) {
  return (
    <div>
      <div className="grid grid-cols-7 border-b border-hairline pb-2 text-center text-xs text-fg-secondary">
        {days.slice(0, 7).map((d) => (
          <span key={d}>{TH_WEEKDAYS_SHORT[weekdayOf(d)]}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1 pt-2">
        {days.map((day) => {
          const items = byDate.get(day) ?? [];
          const isToday = day === today;
          const isSelected = day === selected;
          return (
            <button
              key={day}
              type="button"
              onClick={() => onSelect(day)}
              aria-pressed={isSelected}
              aria-label={`${longDayLabel(day)} · ${items.length ? `${items.length} รายการ` : 'ไม่มีรายการ'}${reminderDays.has(day) ? ' · มีการเตือน' : ''}`}
              className={cn(
                'relative flex min-h-[104px] flex-col gap-1 rounded-row p-1.5 text-left transition-colors duration-[180ms]',
                'focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]',
                isToday ? 'bg-surface shadow-card' : 'hover:bg-wash',
                isSelected && 'ring-1 ring-hairline-strong',
                // วันนอกเดือน: ตัวเลขสีรอง (tertiary ไม่ผ่าน contrast 4.5:1 ของ axe)
                !sameMonth(day, anchor) && 'text-fg-secondary',
              )}
            >
              <span
                className={cn(
                  'flex size-6 items-center justify-center rounded-full font-mono text-xs',
                  isToday && 'bg-primary font-semibold text-primary-fg',
                )}
              >
                {Number(day.slice(8, 10))}
              </span>
              {reminderDays.has(day) ? (
                <span
                  aria-hidden="true"
                  className="absolute right-2 top-2 size-1.5 rounded-full bg-accent"
                />
              ) : null}
              <span className="flex flex-col gap-0.5">
                {items.slice(0, MAX_IN_CELL).map((e) => (
                  <EventLine key={e.id} event={e} timeZone={timeZone} />
                ))}
                {items.length > MAX_IN_CELL ? (
                  <span className="px-1.5 text-[11px] text-fg-secondary">
                    +{items.length - MAX_IN_CELL}
                  </span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** เวลาที่แสดงใน week view: 06:00–24:00 (สเปก 8.11.4) */
const DAY_START_MIN = 6 * 60;
const DAY_SPAN_MIN = 18 * 60;
const HOURS = Array.from({ length: 18 }, (_, i) => 6 + i);

function minutesOf(iso: string, timeZone: string): number {
  const [h, m] = timeOf(iso, timeZone).split(':').map(Number);
  return h! * 60 + m!;
}

export function WeekGrid({
  days,
  today,
  selected,
  byDate,
  timeZone,
  onSelect,
}: {
  days: string[];
  today: string;
  selected: string;
  byDate: Map<string, CalendarEventDto[]>;
  timeZone: string;
  onSelect: (day: string) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[640px] grid-cols-[48px_repeat(7,minmax(0,1fr))]">
        <span />
        {days.map((day) => (
          <button
            key={day}
            type="button"
            onClick={() => onSelect(day)}
            aria-pressed={day === selected}
            className={cn(
              'flex flex-col items-center gap-0.5 rounded-control py-1.5 text-xs text-fg-secondary hover:bg-wash',
              'focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]',
              day === selected && 'bg-wash text-fg',
            )}
          >
            <span>{TH_WEEKDAYS_SHORT[weekdayOf(day)]}</span>
            <span
              className={cn(
                'flex size-7 items-center justify-center rounded-full font-mono text-sm text-fg',
                day === today && 'bg-primary font-semibold text-primary-fg',
              )}
            >
              {Number(day.slice(8, 10))}
            </span>
          </button>
        ))}

        {/* แถวทั้งวัน */}
        <span className="pr-2 pt-2 text-right font-mono text-[10px] text-fg-tertiary">ทั้งวัน</span>
        {days.map((day) => (
          <div
            key={day}
            className="flex min-h-9 flex-col gap-0.5 border-b border-l border-hairline p-1"
          >
            {(byDate.get(day) ?? [])
              .filter((e) => e.allDay)
              .map((e) => (
                <EventLine key={e.id} event={e} timeZone={timeZone} />
              ))}
          </div>
        ))}

        {/* time grid */}
        <div className="relative" style={{ height: HOURS.length * 44 }}>
          {HOURS.map((h, i) => (
            <span
              key={h}
              className="absolute right-2 -translate-y-1/2 font-mono text-[10px] text-fg-tertiary"
              style={{ top: i * 44 }}
            >
              {i === 0 ? '' : `${String(h).padStart(2, '0')}:00`}
            </span>
          ))}
        </div>
        {days.map((day) => (
          <div
            key={day}
            className="relative border-l border-hairline"
            style={{
              height: HOURS.length * 44,
              backgroundImage:
                'repeating-linear-gradient(to bottom, transparent 0 43px, var(--border) 43px 44px)',
            }}
          >
            {(byDate.get(day) ?? [])
              .filter((e) => !e.allDay)
              .map((e) => {
                const offset = Math.min(
                  Math.max(minutesOf(e.start, timeZone) - DAY_START_MIN, 0),
                  DAY_SPAN_MIN - 30,
                );
                return (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => onSelect(day)}
                    className="absolute inset-x-1 text-left focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
                    style={{ top: `${(offset / DAY_SPAN_MIN) * 100}%` }}
                  >
                    <EventLine event={e} timeZone={timeZone} />
                  </button>
                );
              })}
          </div>
        ))}
      </div>
    </div>
  );
}

/** แถบสัปดาห์บนมือถือ (สเปก 8.11.4: "Agenda + แถบสัปดาห์เลื่อนได้ด้านบน") */
export function WeekStrip({
  days,
  today,
  selected,
  byDate,
  onSelect,
}: {
  days: string[];
  today: string;
  selected: string;
  byDate: Map<string, CalendarEventDto[]>;
  onSelect: (day: string) => void;
}) {
  return (
    <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
      {days.map((day) => {
        const count = byDate.get(day)?.length ?? 0;
        return (
          <button
            key={day}
            type="button"
            onClick={() => onSelect(day)}
            aria-pressed={day === selected}
            aria-label={`${longDayLabel(day)} · ${count} รายการ`}
            className={cn(
              'flex min-w-11 flex-1 flex-col items-center gap-1 rounded-row py-2 text-xs',
              'focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]',
              day === selected ? 'bg-primary text-primary-fg' : 'bg-sunken text-fg-secondary',
            )}
          >
            <span>{TH_WEEKDAYS_SHORT[weekdayOf(day)]}</span>
            <span className={cn('font-mono text-sm', day === today && 'font-semibold underline')}>
              {Number(day.slice(8, 10))}
            </span>
            <span
              aria-hidden="true"
              className={cn('size-1 rounded-full', count ? 'bg-current' : 'bg-transparent')}
            />
          </button>
        );
      })}
    </div>
  );
}

/** รายการจัดกลุ่มตามวัน — view หลักบนมือถือ */
export function AgendaList({
  days,
  today,
  byDate,
  timeZone,
  onSelect,
}: {
  days: string[];
  today: string;
  byDate: Map<string, CalendarEventDto[]>;
  timeZone: string;
  onSelect: (day: string) => void;
}) {
  const withEvents = days.filter((d) => byDate.get(d)?.length);
  if (withEvents.length === 0) {
    return <p className="py-12 text-center text-sm text-fg-secondary">ไม่มีรายการในช่วงนี้</p>;
  }
  return (
    <ol className="space-y-4">
      {withEvents.map((day) => (
        <li key={day}>
          <button
            type="button"
            onClick={() => onSelect(day)}
            className="mb-1.5 text-xs font-medium text-fg-secondary hover:text-fg focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
          >
            {longDayLabel(day)}
            {day === today ? ' · วันนี้' : ''}
          </button>
          <ul className="space-y-1">
            {byDate.get(day)!.map((e) => (
              <li key={e.id}>
                <EventLine event={e} timeZone={timeZone} />
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}
