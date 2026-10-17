'use client';

import type { CalendarEventDto, ModuleKey } from '@nosion/contracts';
import { cn, MODULE_THEME } from '@nosion/ui';
import { CircleCheck, Dumbbell, Repeat, Wallet, type LucideIcon } from 'lucide-react';
import * as React from 'react';
import { canMove, longDayLabel, sameMonth, weekdayShort, timeOf, weekdayOf } from './grid';
import { tr } from '@/i18n/current';

export const MODULE_ICON: Record<ModuleKey, LucideIcon> = {
  task: CircleCheck,
  expense: Wallet,
  workout: Dumbbell,
  habit: Repeat,
};

/** MIME ของข้อมูลที่ลาก — กันรับของที่ลากมาจากที่อื่น (ข้อความ / ไฟล์) */
const DRAG_TYPE = 'application/x-nosion-event';

export type MoveHandler = (eventId: string, toDate: string) => void;

/** รายการที่ลากได้ส่ง id ไปกับ dataTransfer · projected/เสร็จแล้วลากไม่ได้ */
function dragProps(event: CalendarEventDto, onMove?: MoveHandler) {
  if (!onMove || !canMove(event)) return {};
  return {
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.setData(DRAG_TYPE, event.id);
      e.dataTransfer.effectAllowed = 'move';
    },
  };
}

/**
 * พื้นที่รับการวาง (ช่องวันของ month / คอลัมน์ของ week) — ไฮไลต์ตอนลากผ่าน
 * การลากใช้เมาส์ได้อย่างเดียว ทางเลือกสำหรับคีย์บอร์ด/มือถือคือ "ย้ายไปวัน" ใน day panel (WCAG 2.1.1)
 */
function useDropZone(day: string, onMove?: MoveHandler) {
  const [over, setOver] = React.useState(false);
  if (!onMove) return { over: false, props: {} };
  return {
    over,
    props: {
      onDragOver: (e: React.DragEvent) => {
        if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setOver(true);
      },
      onDragLeave: () => setOver(false),
      onDrop: (e: React.DragEvent) => {
        setOver(false);
        const id = e.dataTransfer.getData(DRAG_TYPE);
        if (!id) return;
        e.preventDefault();
        onMove(id, day);
      },
    },
  };
}

/** รายการในช่องปฏิทิน — prefix โมดูล (T: E: W: H:) ไม่พึ่งสีอย่างเดียว (สเปก 8.7.2) */
function EventLine({
  event,
  timeZone,
  className,
  ...props
}: { event: CalendarEventDto; timeZone: string } & React.HTMLAttributes<HTMLSpanElement>) {
  const theme = MODULE_THEME[event.module];
  return (
    <span
      className={cn(
        'flex min-w-0 items-center gap-1 rounded-[6px] px-1.5 py-0.5 text-[11px] leading-tight',
        event.status === 'done' ? 'text-fg-secondary line-through' : 'text-fg',
        event.projected ? 'border border-dashed border-hairline-strong' : 'bg-wash',
        props.draggable && 'cursor-grab active:cursor-grabbing',
        className,
      )}
      {...props}
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

interface MonthGridProps {
  days: string[];
  anchor: string;
  today: string;
  selected: string;
  byDate: Map<string, CalendarEventDto[]>;
  reminderDays: Set<string>;
  timeZone: string;
  onSelect: (day: string) => void;
  onMove?: MoveHandler;
}

export function MonthGrid(props: MonthGridProps) {
  const { days } = props;
  return (
    <div>
      <div className="grid grid-cols-7 border-b border-hairline pb-2 text-center text-xs text-fg-secondary">
        {days.slice(0, 7).map((d) => (
          <span key={d}>{weekdayShort(weekdayOf(d))}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1 pt-2">
        {days.map((day) => (
          <MonthCell key={day} day={day} {...props} />
        ))}
      </div>
    </div>
  );
}

/**
 * ช่องหนึ่งวัน: ปุ่มเลือกวันปูเต็มช่อง (คีย์บอร์ด/screen reader ใช้ตัวนี้) + รายการวางทับด้านบน
 * ไม่ห่อรายการไว้ใน <button> — ของที่ลากได้ซ้อนในปุ่มลากไม่ขึ้นในบางเบราว์เซอร์
 */
function MonthCell({
  day,
  anchor,
  today,
  selected,
  byDate,
  reminderDays,
  timeZone,
  onSelect,
  onMove,
}: MonthGridProps & { day: string }) {
  const items = byDate.get(day) ?? [];
  const isToday = day === today;
  const drop = useDropZone(day, onMove);
  return (
    <div
      {...drop.props}
      className={cn(
        'relative flex min-h-[104px] flex-col gap-1 rounded-row p-1.5 transition-colors duration-[180ms]',
        isToday ? 'bg-surface shadow-card' : 'hover:bg-wash',
        day === selected && 'ring-1 ring-hairline-strong',
        drop.over && 'bg-accent-soft ring-2 ring-accent',
        // วันนอกเดือน: ตัวเลขสีรอง (tertiary ไม่ผ่าน contrast 4.5:1 ของ axe)
        !sameMonth(day, anchor) && 'text-fg-secondary',
      )}
    >
      <button
        type="button"
        onClick={() => onSelect(day)}
        aria-pressed={day === selected}
        aria-label={`${longDayLabel(day)} · ${items.length ? tr('calendar.dayItems', { count: items.length }) : tr('calendar.noItems')}${reminderDays.has(day) ? tr('calendar.withReminder') : ''}`}
        className="absolute inset-0 rounded-row focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
      />
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none relative flex size-6 items-center justify-center rounded-full font-mono text-xs',
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
      {/* รายการเป็นแค่ภาพ (ข้อมูลเดียวกันอยู่ใน aria-label ของปุ่ม + day panel) */}
      <span aria-hidden="true" className="relative flex flex-col gap-0.5">
        {items.slice(0, MAX_IN_CELL).map((e) => (
          <EventLine
            key={e.id}
            event={e}
            timeZone={timeZone}
            onClick={() => onSelect(day)}
            {...dragProps(e, onMove)}
          />
        ))}
        {items.length > MAX_IN_CELL ? (
          <span className="pointer-events-none px-1.5 text-[11px] text-fg-secondary">
            +{items.length - MAX_IN_CELL}
          </span>
        ) : null}
      </span>
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
  onMove,
}: {
  days: string[];
  today: string;
  selected: string;
  byDate: Map<string, CalendarEventDto[]>;
  timeZone: string;
  onSelect: (day: string) => void;
  onMove?: MoveHandler;
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
            <span>{weekdayShort(weekdayOf(day))}</span>
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
        <span className="pr-2 pt-2 text-right font-mono text-[10px] text-fg-tertiary">
          {tr('calendar.allDay')}
        </span>
        {days.map((day) => (
          <WeekAllDay
            key={day}
            day={day}
            events={byDate.get(day) ?? []}
            timeZone={timeZone}
            onMove={onMove}
          />
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
          <WeekColumn
            key={day}
            day={day}
            events={byDate.get(day) ?? []}
            timeZone={timeZone}
            onSelect={onSelect}
            onMove={onMove}
          />
        ))}
      </div>
    </div>
  );
}

interface WeekCellProps {
  day: string;
  events: CalendarEventDto[];
  timeZone: string;
  onMove?: MoveHandler;
}

function WeekAllDay({ day, events, timeZone, onMove }: WeekCellProps) {
  const drop = useDropZone(day, onMove);
  return (
    <div
      {...drop.props}
      aria-hidden="true"
      className={cn(
        'flex min-h-9 flex-col gap-0.5 border-b border-l border-hairline p-1',
        drop.over && 'bg-accent-soft',
      )}
    >
      {events
        .filter((e) => e.allDay)
        .map((e) => (
          <EventLine key={e.id} event={e} timeZone={timeZone} {...dragProps(e, onMove)} />
        ))}
    </div>
  );
}

/** คอลัมน์เวลาของหนึ่งวัน — วางที่ไหนในคอลัมน์ก็ได้: เปลี่ยนวัน คงเวลาเดิม */
function WeekColumn({
  day,
  events,
  timeZone,
  onSelect,
  onMove,
}: WeekCellProps & { onSelect: (day: string) => void }) {
  const drop = useDropZone(day, onMove);
  return (
    <div
      {...drop.props}
      aria-hidden="true"
      className={cn('relative border-l border-hairline', drop.over && 'bg-accent-soft')}
      style={{
        height: HOURS.length * 44,
        backgroundImage:
          'repeating-linear-gradient(to bottom, transparent 0 43px, var(--border) 43px 44px)',
      }}
    >
      {events
        .filter((e) => !e.allDay)
        .map((e) => {
          const offset = Math.min(
            Math.max(minutesOf(e.start, timeZone) - DAY_START_MIN, 0),
            DAY_SPAN_MIN - 30,
          );
          return (
            <EventLine
              key={e.id}
              event={e}
              timeZone={timeZone}
              onClick={() => onSelect(day)}
              className="absolute inset-x-1"
              style={{ top: `${(offset / DAY_SPAN_MIN) * 100}%` }}
              {...dragProps(e, onMove)}
            />
          );
        })}
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
            aria-label={`${longDayLabel(day)} · ${tr('calendar.dayItems', { count })}`}
            className={cn(
              'flex min-w-11 flex-1 flex-col items-center gap-1 rounded-row py-2 text-xs',
              'focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]',
              day === selected ? 'bg-primary text-primary-fg' : 'bg-sunken text-fg-secondary',
            )}
          >
            <span>{weekdayShort(weekdayOf(day))}</span>
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
    return (
      <p className="py-12 text-center text-sm text-fg-secondary">{tr('calendar.emptyRange')}</p>
    );
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
            {day === today ? tr('calendar.todaySuffix') : ''}
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
