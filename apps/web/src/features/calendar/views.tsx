'use client';

import type { CalendarEventDto, ModuleKey } from '@nosion/contracts';
import { cn, MODULE_THEME } from '@nosion/ui';
import { CircleCheck, Dumbbell, Repeat, Wallet, type LucideIcon } from 'lucide-react';
import * as React from 'react';
import {
  addDays,
  canMove,
  daysBetween,
  isSpanning,
  layoutWeek,
  longDayLabel,
  sameMonth,
  weekdayShort,
  timeOf,
  weekdayOf,
  type WeekSegment,
} from './grid';
import { openTaskDetail } from '@/features/tasks/task-detail-dialog';
import { tr } from '@/i18n/current';

export const MODULE_ICON: Record<ModuleKey, LucideIcon> = {
  task: CircleCheck,
  expense: Wallet,
  workout: Dumbbell,
  habit: Repeat,
};

/** งานจริง (ไม่ใช่รอบ projected) เปิดหน้าต่างรายละเอียดได้ */
const isOpenableTask = (e: CalendarEventDto) =>
  e.module === 'task' && e.entryId !== null && !e.projected;

/** คลิกรายการบน grid: เลือกวัน + ถ้าเป็นงาน เปิดรายละเอียดด้วย */
function selectAndOpen(e: CalendarEventDto, day: string, onSelect?: (day: string) => void) {
  onSelect?.(day);
  if (isOpenableTask(e)) openTaskDetail(e.entryId!);
}

/** MIME ของข้อมูลที่ลาก — กันรับของที่ลากมาจากที่อื่น (ข้อความ / ไฟล์) */
const DRAG_TYPE = 'application/x-nosion-event';

export type MoveHandler = (eventId: string, toDate: string) => void;

/**
 * รายการที่ลากได้ส่ง id ไปกับ dataTransfer · projected/เสร็จแล้วลากไม่ได้
 * แถบหลายวันส่ง "จับที่วันที่เท่าไรของแถบ" ไปด้วย — วางแล้ววันที่จับอยู่ใต้เมาส์ (ไม่ใช่วันแรกกระโดดมาที่เมาส์)
 */
function dragProps(
  event: CalendarEventDto,
  onMove?: MoveHandler,
  grab?: { firstDay: string; span: number },
) {
  if (!onMove || !canMove(event)) return {};
  return {
    draggable: true,
    onDragStart: (e: React.DragEvent<HTMLElement>) => {
      let offset = 0;
      if (grab) {
        const rect = e.currentTarget.getBoundingClientRect();
        const column = Math.floor(((e.clientX - rect.left) / rect.width) * grab.span);
        offset =
          daysBetween(event.date, grab.firstDay) + Math.min(Math.max(column, 0), grab.span - 1);
      }
      e.dataTransfer.setData(DRAG_TYPE, `${event.id}|${offset}`);
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
        const [id, offset] = e.dataTransfer.getData(DRAG_TYPE).split('|');
        if (!id) return;
        e.preventDefault();
        onMove(id, addDays(day, -Number(offset ?? 0)));
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
        props.onClick && isOpenableTask(event) && 'cursor-pointer hover:bg-wash-active',
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
const MAX_IN_CELL_TALL = 6;

interface MonthGridProps {
  days: string[];
  anchor: string;
  today: string;
  selected: string;
  byDate: Map<string, CalendarEventDto[]>;
  /** รายการทั้งช่วง (ไม่กระจายรายวัน) — วางเป็นแถบหลายวันได้ */
  events: CalendarEventDto[];
  reminderDays: Set<string>;
  timeZone: string;
  onSelect: (day: string) => void;
  onMove?: MoveHandler;
  /** โหมดเต็มจอ — ช่องสูงตามจอ แสดงรายการต่อวันได้มากขึ้น */
  tall?: boolean;
}

export function MonthGrid(props: MonthGridProps) {
  const { days, events } = props;
  const weeks = Array.from({ length: days.length / 7 }, (_, i) => days.slice(i * 7, i * 7 + 7));
  return (
    <div>
      <div className="grid grid-cols-7 border-b border-hairline pb-2 text-center text-xs text-fg-secondary">
        {days.slice(0, 7).map((d) => (
          <span key={d}>{weekdayShort(weekdayOf(d))}</span>
        ))}
      </div>
      <div className="space-y-1 pt-2">
        {weeks.map((week) => (
          <MonthWeek key={week[0]} week={week} segments={layoutWeek(events, week)} {...props} />
        ))}
      </div>
    </div>
  );
}

/** ความสูงของหนึ่งแถวย่อย (lane) + ระยะห่าง — ต้องตรงกับ EventLine (text-[11px] · py-0.5) */
const LANE_PX = 18;
const LANE_GAP_PX = 2;
/** หัวช่อง: p-1.5 + เลขวัน size-6 + ช่องว่างก่อนรายการแรก */
const CELL_HEAD_PX = 32;

/**
 * หนึ่งสัปดาห์ของ month grid เป็น CSS grid เดียว: ช่องวัน 7 ช่อง (เลือกวัน / รับการวาง) กินทุกแถว
 * รายการวางในแถวย่อย (lane) ทับด้านบน — แถบหลายวันกินหลายคอลัมน์ต่อกันได้ · ความสูงขยายตามจำนวนแถว
 */
function MonthWeek({
  week,
  segments,
  ...props
}: MonthGridProps & { week: string[]; segments: WeekSegment[] }) {
  const maxLanes = props.tall ? MAX_IN_CELL_TALL : MAX_IN_CELL;
  // ระหว่างลาก: รายการไม่รับเมาส์ → ปล่อยบนแถบก็วางลงช่องวันข้างใต้
  const [dragging, setDragging] = React.useState(false);
  const hidden = week.map(
    (_, column) =>
      segments.filter((s) => s.lane >= maxLanes && s.column <= column && column < s.column + s.span)
        .length,
  );
  const lanes =
    Math.min(Math.max(0, ...segments.map((s) => s.lane + 1)), maxLanes) +
    (hidden.some(Boolean) ? 1 : 0);
  return (
    <div
      className={cn(
        'grid min-h-[104px] grid-cols-7 gap-x-1',
        // 6 แถวเต็มความสูงจอ (หักหัวหน้า + แถบชื่อวัน)
        props.tall && 'min-h-[max(104px,calc((100dvh_-_260px)/6))]',
      )}
      style={{
        gridTemplateRows: `${CELL_HEAD_PX}px repeat(${lanes}, ${LANE_PX}px) minmax(6px, 1fr)`,
        rowGap: LANE_GAP_PX,
      }}
      onDragStart={() => setTimeout(() => setDragging(true), 0)}
      onDragEnd={() => setDragging(false)}
      onDrop={() => setDragging(false)}
    >
      {week.map((day, column) => (
        <MonthCell key={day} day={day} column={column} {...props} />
      ))}
      {/* รายการเป็นแค่ภาพ (ข้อมูลเดียวกันอยู่ใน aria-label ของปุ่มวัน + day panel) */}
      {segments
        .filter((s) => s.lane < maxLanes)
        .map((s) => (
          <SegmentLine
            key={s.event.id}
            segment={s}
            week={week}
            timeZone={props.timeZone}
            onSelect={props.onSelect}
            onMove={props.onMove}
            className={cn('relative', dragging && 'pointer-events-none')}
            row={s.lane + 2}
          />
        ))}
      {hidden.map((count, column) =>
        count ? (
          <span
            key={week[column]}
            aria-hidden="true"
            className="pointer-events-none relative px-3 text-[11px] leading-[18px] text-fg-secondary"
            style={{ gridColumn: column + 1, gridRow: maxLanes + 2 }}
          >
            +{count}
          </span>
        ) : null,
      )}
    </div>
  );
}

/** ชิ้นของรายการในแถวสัปดาห์ — แถบที่ต่อจาก/ไปสัปดาห์อื่นชิดขอบและไม่โค้งด้านนั้น */
function SegmentLine({
  segment,
  week,
  timeZone,
  onSelect,
  onMove,
  className,
  row,
}: {
  segment: WeekSegment;
  week: string[];
  timeZone: string;
  onSelect?: (day: string) => void;
  onMove?: MoveHandler;
  className?: string;
  /** แถวของ grid ที่วาง (ค่าเริ่มต้น = lane + 1) */
  row?: number;
}) {
  const { event, column, span, lane, continuesBefore, continuesAfter } = segment;
  const firstDay = week[column]!;
  return (
    <EventLine
      event={event}
      timeZone={timeZone}
      onClick={() => selectAndOpen(event, firstDay, onSelect)}
      aria-hidden="true"
      className={cn(
        'h-[18px]',
        continuesBefore ? 'rounded-l-none' : 'ml-1.5',
        continuesAfter ? 'rounded-r-none' : 'mr-1.5',
        className,
      )}
      style={{ gridColumn: `${column + 1} / span ${span}`, gridRow: row ?? lane + 1 }}
      {...dragProps(event, onMove, isSpanning(event) ? { firstDay, span } : undefined)}
    />
  );
}

/**
 * ช่องหนึ่งวัน (กินทุกแถวของสัปดาห์): ปุ่มเลือกวันปูเต็มช่อง (คีย์บอร์ด/screen reader ใช้ตัวนี้)
 * รายการเป็นพี่น้องใน grid ของสัปดาห์ วางทับด้านบน — ไม่ห่อไว้ใน <button> (ของที่ลากได้ซ้อนในปุ่มลากไม่ขึ้นในบางเบราว์เซอร์)
 */
function MonthCell({
  day,
  column,
  anchor,
  today,
  selected,
  byDate,
  reminderDays,
  onSelect,
  onMove,
}: MonthGridProps & { day: string; column: number }) {
  const items = byDate.get(day) ?? [];
  const isToday = day === today;
  const drop = useDropZone(day, onMove);
  return (
    <div
      {...drop.props}
      style={{ gridColumn: column + 1, gridRow: '1 / -1' }}
      className={cn(
        'relative rounded-row p-1.5 transition-colors duration-[180ms]',
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
  events,
  timeZone,
  onSelect,
  onMove,
}: {
  days: string[];
  today: string;
  selected: string;
  byDate: Map<string, CalendarEventDto[]>;
  /** รายการทั้งช่วง (ไม่กระจายรายวัน) — แถวทั้งวันวางเป็นแถบหลายวัน */
  events: CalendarEventDto[];
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
        <WeekAllDayRow
          days={days}
          events={events}
          timeZone={timeZone}
          onSelect={onSelect}
          onMove={onMove}
        />

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

/**
 * แถวทั้งวันของ week view — รายการทั้งวัน + แถบหลายวัน (กินหลายคอลัมน์) · ช่องวันข้างใต้รับการวาง
 * แสดงทุกแถวย่อย (ไม่ตัด +N เหมือน month — สัปดาห์เดียวมีที่พอ)
 */
function WeekAllDayRow({
  days,
  events,
  timeZone,
  onSelect,
  onMove,
}: {
  days: string[];
  events: CalendarEventDto[];
  timeZone: string;
  onSelect: (day: string) => void;
  onMove?: MoveHandler;
}) {
  const [dragging, setDragging] = React.useState(false);
  const segments = layoutWeek(
    events.filter((e) => e.allDay || isSpanning(e)),
    days,
  );
  const lanes = Math.max(1, ...segments.map((s) => s.lane + 1));
  return (
    <div
      aria-hidden="true"
      className="col-span-7 grid grid-cols-7"
      style={{
        gridTemplateRows: `4px repeat(${lanes}, ${LANE_PX}px) 4px`,
        rowGap: LANE_GAP_PX,
      }}
      onDragStart={() => setTimeout(() => setDragging(true), 0)}
      onDragEnd={() => setDragging(false)}
      onDrop={() => setDragging(false)}
    >
      {days.map((day, column) => (
        <WeekAllDayCell key={day} day={day} column={column} onMove={onMove} />
      ))}
      {segments.map((s) => (
        <SegmentLine
          key={s.event.id}
          segment={s}
          week={days}
          timeZone={timeZone}
          onSelect={onSelect}
          onMove={onMove}
          className={cn('relative', dragging && 'pointer-events-none')}
          row={s.lane + 2}
        />
      ))}
    </div>
  );
}

function WeekAllDayCell({
  day,
  column,
  onMove,
}: {
  day: string;
  column: number;
  onMove?: MoveHandler;
}) {
  const drop = useDropZone(day, onMove);
  return (
    <div
      {...drop.props}
      style={{ gridColumn: column + 1, gridRow: '1 / -1' }}
      className={cn('min-h-9 border-b border-l border-hairline', drop.over && 'bg-accent-soft')}
    />
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
        .filter((e) => !e.allDay && !isSpanning(e))
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
              onClick={() => selectAndOpen(e, day, onSelect)}
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
                {isOpenableTask(e) ? (
                  <button
                    type="button"
                    onClick={() => openTaskDetail(e.entryId!)}
                    aria-label={tr('dayPanel.openDetail', { title: e.title })}
                    className="block w-full rounded-[6px] text-left focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
                  >
                    <EventLine event={e} timeZone={timeZone} className="hover:bg-wash-active" />
                  </button>
                ) : (
                  <EventLine event={e} timeZone={timeZone} />
                )}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}
