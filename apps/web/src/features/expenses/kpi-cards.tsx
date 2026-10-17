'use client';

import type { BudgetTone } from '@nosion/contracts';
import { parseAmountToMinor } from '@nosion/core/money';
import { AlertTriangle, CheckCircle2, OctagonAlert, CalendarClock } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Sparkline } from './charts';
import { baht, shortDate } from './format';
import { useBills, useBudgetStatus, useForecast, useSetTotalBudget } from './use-expense-queries';
import { tr } from '@/i18n/current';

/** สถานะงบ/คาดการณ์ — สีมาพร้อมไอคอนและข้อความเสมอ (ไม่สื่อด้วยสีอย่างเดียว) */
const TONE: Record<
  BudgetTone,
  { tone: 'neutral' | 'outline' | 'danger'; Icon: typeof CheckCircle2 }
> = {
  // monochrome ตาม mockup — สีแดงเหลือไว้แค่ "เกินงบ" ซึ่งต้องลงมือทำจริง
  safe: { tone: 'neutral', Icon: CheckCircle2 },
  warning: { tone: 'outline', Icon: AlertTriangle },
  over: { tone: 'danger', Icon: OctagonAlert },
};

export function ToneBadge({ tone }: { tone: BudgetTone }) {
  const t = TONE[tone];
  return (
    <Badge tone={t.tone}>
      <t.Icon aria-hidden="true" /> {tr(`kpi.tone.${tone}`)}
    </Badge>
  );
}

/**
 * โครงการ์ด KPI ตาม mockup: ป้ายเล็กมุมซ้ายบน + ชิปมุมขวา · ไม่มีกล่องไอคอน · ตัวเลข ~44px
 * ใช้ h2 (ซ่อนรูปแบบหัวข้อใหญ่) เพื่อให้ screen reader ไล่หัวข้อในหน้าได้
 */
function KpiCard({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className="flex flex-col p-5 md:p-6">
      <div className="flex min-h-7 items-start justify-between gap-3">
        <h2 className="text-[13px] font-normal text-fg-secondary">{title}</h2>
        {aside}
      </div>
      <div className="mt-4 flex flex-1 flex-col gap-3">{children}</div>
    </Card>
  );
}

const BIG = 'nums text-[36px] font-semibold leading-none tracking-display md:text-[44px]';

function KpiSkeleton() {
  return (
    <Card>
      <div className="space-y-3 p-5 md:p-6">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-1.5 w-full" />
        <Skeleton className="h-3 w-24" />
      </div>
    </Card>
  );
}

function KpiError({ title }: { title: string }) {
  return (
    <Card>
      <CardContent className="pt-5 md:pt-6">
        <p role="alert" className="text-sm text-fg-secondary">
          {tr('kpi.loadFailed', { title })}
        </p>
      </CardContent>
    </Card>
  );
}

// ── KPI 1: รายจ่ายเดือนนี้ ───────────────────────────
export function SpendKpi() {
  const query = useBudgetStatus();
  if (query.isPending) return <KpiSkeleton />;
  if (!query.data) return <KpiError title={tr('kpi.spend')} />;
  const { total, firstDay, lastDay, currency } = query.data;
  const pct = total.ratio === null ? null : Math.round(total.ratio * 1000) / 10;
  const left = total.budgetMinor === null ? null : total.budgetMinor - total.spentMinor;

  return (
    <KpiCard
      title={tr('kpi.spend')}
      aside={
        pct !== null ? (
          <Badge tone="neutral" className="nums">
            {tr('kpi.used', { pct })}
          </Badge>
        ) : null
      }
    >
      <p className="flex flex-wrap items-baseline gap-x-2">
        <span className={BIG} lang="en">
          {baht(total.spentMinor, currency)}
        </span>
        {total.budgetMinor !== null ? (
          <span className="nums text-sm text-fg-secondary" lang="en">
            / {baht(total.budgetMinor, currency)}
          </span>
        ) : null}
      </p>
      {total.budgetMinor !== null ? (
        <>
          <p className="flex items-center justify-between gap-2 text-[13px] text-fg-secondary">
            {left !== null && left >= 0
              ? tr('kpi.left', { amount: baht(left, currency) })
              : tr('kpi.over', { amount: baht(-(left ?? 0), currency) })}
            {total.tone !== 'safe' ? <ToneBadge tone={total.tone} /> : null}
          </p>
          <Progress
            value={total.spentMinor}
            max={total.budgetMinor}
            budget
            label={tr('kpi.progress')}
            className="mt-auto h-2"
          />
          <p className="flex justify-between font-mono text-[11px] text-fg-secondary">
            <span>{tr('kpi.start', { date: shortDate(firstDay) })}</span>
            <span>{tr('kpi.end', { date: shortDate(lastDay) })}</span>
          </p>
        </>
      ) : (
        <SetBudgetForm />
      )}
    </KpiCard>
  );
}

/** ยังไม่มีงบ → ตั้งงบรวมได้ทันทีในการ์ด (empty state ที่ทำอะไรได้ ไม่ใช่แค่บอกว่าว่าง) */
function SetBudgetForm() {
  const [value, setValue] = useState('');
  const save = useSetTotalBudget();
  const minor = parseAmountToMinor(value.replace(/[฿\s]/g, ''));
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (minor && minor > 0) save.mutate(minor, { onSuccess: () => setValue('') });
      }}
    >
      <label className="sr-only" htmlFor="total-budget">
        {tr('kpi.budgetLabel')}
      </label>
      <input
        id="total-budget"
        inputMode="decimal"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={tr('kpi.budgetPlaceholder')}
        className="h-9 min-w-0 flex-1 rounded-control border border-hairline-strong bg-surface px-3 text-sm text-fg placeholder:text-fg-tertiary focus-visible:border-accent focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
      />
      <Button type="submit" size="sm" variant="secondary" disabled={!minor || save.isPending}>
        {tr('kpi.setBudget')}
      </Button>
    </form>
  );
}

// ── KPI 2: คาดการณ์สิ้นเดือน ─────────────────────────
export function ForecastKpi() {
  const query = useForecast();
  if (query.isPending) return <KpiSkeleton />;
  if (!query.data) return <KpiError title={tr('kpi.forecast')} />;
  const f = query.data;
  const marginPct =
    f.marginMinor !== null && f.budgetMinor
      ? Math.round((Math.abs(f.marginMinor) / f.budgetMinor) * 100)
      : null;

  return (
    <KpiCard
      title={tr('kpi.forecast')}
      aside={f.budgetMinor !== null ? <ToneBadge tone={f.status} /> : null}
    >
      <p className={BIG} lang="en">
        {baht(f.projectedMinor, f.currency)}
      </p>
      <p className="text-[13px] text-fg-secondary">
        {f.marginMinor === null
          ? tr('kpi.forecastNoBudget')
          : f.marginMinor >= 0
            ? tr('kpi.forecastUnder', {
                amount: baht(f.marginMinor, f.currency),
                pct: marginPct ?? 0,
              })
            : tr('kpi.forecastOver', {
                amount: baht(-f.marginMinor, f.currency),
                pct: marginPct ?? 0,
              })}
      </p>
      <Sparkline
        className="mt-auto pt-1"
        points={f.series.map((p) => ({ x: p.date, y: p.cumulativeMinor }))}
        label={`${tr('kpi.sparkline', { day: f.dayOfMonth, amount: baht(f.spentToDateMinor, f.currency) })}${f.unpaidBillsMinor > 0 ? tr('kpi.sparklineBills', { amount: baht(f.unpaidBillsMinor, f.currency) }) : ''}`}
        format={(y) => baht(y, f.currency)}
      />
    </KpiCard>
  );
}

// ── KPI 3: บิลประจำ ──────────────────────────────────
export function BillsKpi() {
  const query = useBills();
  if (query.isPending) return <KpiSkeleton />;
  if (!query.data) return <KpiError title={tr('kpi.bills')} />;
  const b = query.data;
  const overdue = b.bills.filter((x) => x.daysUntilDue !== null && x.daysUntilDue < 0);

  const dueSoon = b.bills.filter(
    (x) => x.daysUntilDue !== null && x.daysUntilDue >= 0 && x.daysUntilDue < 7,
  );

  return (
    <KpiCard
      title={tr('kpi.billsTitle')}
      aside={<CalendarClock size={18} aria-hidden="true" className="text-fg-secondary" />}
    >
      <p className="flex items-baseline gap-2">
        <span className={BIG} lang="en">
          {baht(b.fixedMonthlyMinor, b.currency)}
        </span>
        <span className="text-sm text-fg-secondary">{tr('kpi.perMonth')}</span>
      </p>
      <p className="text-[13px] text-fg-secondary">
        {tr.rich('kpi.dueSoon', {
          count: b.dueSoonCount,
          b: (chunks) => <span className="nums font-medium text-fg">{chunks}</span>,
        })}
      </p>
      {overdue.length > 0 ? (
        <p className="mt-auto flex items-center gap-2 rounded-row bg-danger-soft px-3 py-2.5 text-[13px] text-danger">
          <AlertTriangle size={16} aria-hidden="true" className="shrink-0" />
          {tr('kpi.overdueBills', { titles: overdue.map((x) => x.title).join(', ') })}
        </p>
      ) : dueSoon.length > 0 ? (
        <p className="mt-auto flex items-center gap-2 rounded-row bg-sunken px-3 py-2.5 text-[13px] text-fg">
          <AlertTriangle size={16} aria-hidden="true" className="shrink-0" />
          {tr('kpi.dueSoonBills', { titles: dueSoon.map((x) => x.title).join(' & ') })}
        </p>
      ) : null}
    </KpiCard>
  );
}
