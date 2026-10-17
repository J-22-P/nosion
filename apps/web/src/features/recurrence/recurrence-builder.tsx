'use client';

import type { RecurrenceEndType } from '@nosion/contracts';
import { cn } from '@nosion/ui';
import { CalendarClock } from 'lucide-react';
import { useId } from 'react';
import { FieldError, Input, Label, Select } from '@/components/ui/input';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Skeleton } from '@/components/ui/skeleton';
import {
  WEEKDAYS,
  buildRrule,
  describeDraft,
  formatLocalDate,
  validateDraft,
  weekdayOf,
  type Frequency,
  type RecurrenceDraft,
  type Weekday,
} from './builder';
import { useDraftPreview } from './use-recurrence';
import { tr } from '@/i18n/current';
import { errorText } from '@/i18n/errors';

const FREQS = ['daily', 'weekly', 'monthly', 'yearly'] as const satisfies readonly Frequency[];

const ENDS = ['never', 'onDate', 'afterCount'] as const satisfies readonly RecurrenceEndType[];

const shortWeekday = (day: Weekday) => WEEKDAYS.find((w) => w.value === day)?.short ?? day;

/**
 * ตัวสร้างกฎการเกิดซ้ำ (สเปก 15 Phase 3) — ผู้ใช้ไม่ต้องรู้ RFC 5545
 * controlled component: เจ้าของฟอร์ม (เช่น "เพิ่มรอบบิลใหม่") ถือ draft และเป็นผู้บันทึก
 * preview 10 รอบถัดไปมาจาก engine ฝั่ง API — ตรงกับรายการที่จะถูกสร้างจริงทุกวัน
 */
export function RecurrenceBuilder({
  value,
  onChange,
  className,
}: {
  value: RecurrenceDraft;
  onChange: (next: RecurrenceDraft) => void;
  className?: string;
}) {
  const id = useId();
  const errors = validateDraft(value);
  const preview = useDraftPreview(value);
  const set = (patch: Partial<RecurrenceDraft>) => onChange({ ...value, ...patch });
  const activeWeekdays = value.weekdays.length
    ? value.weekdays
    : /^\d{4}-\d{2}-\d{2}$/.test(value.startsAt)
      ? [weekdayOf(value.startsAt)]
      : [];

  function toggleWeekday(day: Weekday) {
    const next = activeWeekdays.includes(day)
      ? activeWeekdays.filter((d) => d !== day)
      : [...activeWeekdays, day];
    // ต้องเหลืออย่างน้อยหนึ่งวัน — กดวันสุดท้ายออกไม่มีผล
    if (next.length) set({ weekdays: next });
  }

  return (
    <div className={cn('grid gap-5 md:grid-cols-[minmax(0,1fr)_240px]', className)}>
      <fieldset className="min-w-0 space-y-4">
        <legend className="sr-only">{tr('rb.legend')}</legend>

        <div>
          <Label htmlFor={`${id}-start`}>{tr('rb.startDate')}</Label>
          <Input
            id={`${id}-start`}
            type="date"
            value={value.startsAt}
            aria-invalid={!!errors.startsAt}
            onChange={(e) => {
              const startsAt = e.target.value;
              // วันที่ของเดือนตามวันเริ่มไปด้วย จนกว่าผู้ใช้จะเลือกเอง — ค่าเริ่มต้นที่คนส่วนใหญ่ต้องการ
              const followStart = value.monthDay === +value.startsAt.slice(8, 10);
              set({
                startsAt,
                ...(followStart && startsAt ? { monthDay: +startsAt.slice(8, 10) } : {}),
              });
            }}
            className="w-auto"
          />
          <FieldError>{errors.startsAt}</FieldError>
        </div>

        <div>
          <span className="mb-1.5 block text-[13px] font-medium text-fg">{tr('rb.repeat')}</span>
          <SegmentedControl
            label={tr('rb.frequency')}
            size="sm"
            value={value.freq}
            options={FREQS.map((f) => ({ value: f, label: tr(`rb.freq.${f}`) }))}
            onChange={(freq) => set({ freq })}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Label htmlFor={`${id}-interval`} className="mb-0">
            {tr('rb.every')}
          </Label>
          <Input
            id={`${id}-interval`}
            type="number"
            inputMode="numeric"
            min={1}
            max={366}
            value={Number.isNaN(value.interval) ? '' : value.interval}
            aria-invalid={!!errors.interval}
            aria-describedby={errors.interval ? `${id}-interval-error` : undefined}
            onChange={(e) => set({ interval: e.target.valueAsNumber })}
            className="h-9 w-20"
          />
          <span>{tr(`rb.unit.${value.freq}`, { n: value.interval || 1 })}</span>
          {errors.interval ? (
            <p id={`${id}-interval-error`} role="alert" className="w-full text-xs text-danger">
              {errors.interval}
            </p>
          ) : null}
        </div>

        {value.freq === 'weekly' ? (
          <div role="group" aria-label={tr('rb.weekdays')} className="flex flex-wrap gap-1.5">
            {WEEKDAYS.map((day) => {
              const on = activeWeekdays.includes(day.value);
              return (
                <button
                  key={day.value}
                  type="button"
                  aria-pressed={on}
                  aria-label={day.long}
                  onClick={() => toggleWeekday(day.value)}
                  className={cn(
                    'size-9 rounded-full text-[13px] font-medium transition-colors',
                    'focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]',
                    on
                      ? 'bg-primary text-primary-fg'
                      : 'border border-hairline-strong text-fg-secondary hover:bg-wash hover:text-fg',
                  )}
                >
                  {day.short}
                </button>
              );
            })}
          </div>
        ) : null}

        {value.freq === 'monthly' ? (
          <div>
            <Label htmlFor={`${id}-monthday`}>{tr('rb.dayOfMonth')}</Label>
            <Select
              id={`${id}-monthday`}
              value={value.monthDay}
              onChange={(e) => set({ monthDay: +e.target.value })}
            >
              {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>
                  {tr('rb.dayOption', { day: d })}
                </option>
              ))}
            </Select>
            {value.monthDay > 28 ? (
              <p className="mt-1.5 text-xs text-fg-secondary">
                {tr('rb.clampHint', { day: value.monthDay })}
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="space-y-2">
          <span className="block text-[13px] font-medium text-fg">{tr('rb.ends')}</span>
          <SegmentedControl
            label={tr('rb.endCondition')}
            size="sm"
            value={value.endType}
            options={ENDS.map((e) => ({ value: e, label: tr(`rb.end.${e}`) }))}
            onChange={(endType) => set({ endType })}
          />
          {value.endType === 'onDate' ? (
            <div>
              <Label htmlFor={`${id}-ends`} className="sr-only">
                {tr('rb.endDate')}
              </Label>
              <Input
                id={`${id}-ends`}
                type="date"
                min={value.startsAt}
                value={value.endsAt}
                aria-invalid={!!errors.endsAt}
                onChange={(e) => set({ endsAt: e.target.value })}
                className="w-auto"
              />
              <FieldError>{errors.endsAt}</FieldError>
            </div>
          ) : null}
          {value.endType === 'afterCount' ? (
            <div>
              <div className="flex items-center gap-2 text-sm">
                <Label htmlFor={`${id}-count`} className="sr-only">
                  {tr('rb.count')}
                </Label>
                <Input
                  id={`${id}-count`}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={1000}
                  value={Number.isNaN(value.maxCount) ? '' : value.maxCount}
                  aria-invalid={!!errors.maxCount}
                  onChange={(e) => set({ maxCount: e.target.valueAsNumber })}
                  className="h-9 w-24"
                />
                <span>{tr('rb.timesUnit')}</span>
              </div>
              <FieldError>{errors.maxCount}</FieldError>
            </div>
          ) : null}
        </div>
      </fieldset>

      <PreviewPanel draft={value} preview={preview} invalid={Object.keys(errors).length > 0} />
    </div>
  );
}

function PreviewPanel({
  draft,
  preview,
  invalid,
}: {
  draft: RecurrenceDraft;
  preview: ReturnType<typeof useDraftPreview>;
  invalid: boolean;
}) {
  const titleId = useId();
  return (
    <section
      aria-labelledby={titleId}
      className="min-w-0 rounded-panel border border-hairline bg-sunken p-4"
    >
      <h3 id={titleId} className="flex items-center gap-2 text-[13px] font-semibold">
        <CalendarClock size={14} aria-hidden="true" /> {tr('rb.next10')}
      </h3>
      <p className="mt-1 text-xs text-fg-secondary">
        {invalid ? tr('rb.fixFirst') : describeDraft(draft)}
      </p>

      {/* อ่านให้ screen reader เมื่อรายการเปลี่ยน — ผู้ใช้รู้ผลของตัวเลือกโดยไม่ต้องย้าย focus */}
      <div aria-live="polite" aria-busy={preview.isOutdated || preview.isFetching} className="mt-3">
        {invalid ? null : preview.isPending ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-4 w-3/4" />
            ))}
          </div>
        ) : preview.isError ? (
          <p role="alert" className="text-xs text-danger">
            {errorText(preview.error) ?? tr('rb.previewFailed')}
          </p>
        ) : preview.data.localDates.length === 0 ? (
          <p className="text-xs text-fg-secondary">{tr('rb.noOccurrences')}</p>
        ) : (
          <ol
            className={cn(
              'space-y-1 font-mono text-[13px] transition-opacity',
              preview.isOutdated && 'opacity-50',
            )}
          >
            {preview.data.localDates.map((ymd, i) => (
              <li key={ymd} className="flex gap-3">
                <span className="w-5 text-right text-fg-secondary">{i + 1}</span>
                <span className="w-6 text-fg-secondary">{shortWeekday(weekdayOf(ymd))}</span>
                <span>{formatLocalDate(ymd)}</span>
              </li>
            ))}
          </ol>
        )}
      </div>

      <p className="mt-3 break-all border-t border-hairline pt-2 font-mono text-[11px] text-fg-secondary">
        RRULE:{invalid ? '—' : buildRrule(draft)}
      </p>
    </section>
  );
}
