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

/** สถานะงบ/คาดการณ์ — สีมาพร้อมไอคอนและข้อความเสมอ (ไม่สื่อด้วยสีอย่างเดียว) */
const TONE: Record<
  BudgetTone,
  { label: string; tone: 'neutral' | 'outline' | 'danger'; Icon: typeof CheckCircle2 }
> = {
  // monochrome ตาม mockup — สีแดงเหลือไว้แค่ "เกินงบ" ซึ่งต้องลงมือทำจริง
  safe: { label: 'ปลอดภัย', tone: 'neutral', Icon: CheckCircle2 },
  warning: { label: 'ใกล้เกิน', tone: 'outline', Icon: AlertTriangle },
  over: { label: 'เกินงบ', tone: 'danger', Icon: OctagonAlert },
};

export function ToneBadge({ tone }: { tone: BudgetTone }) {
  const t = TONE[tone];
  return (
    <Badge tone={t.tone}>
      <t.Icon aria-hidden="true" /> {t.label}
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
          โหลด “{title}” ไม่สำเร็จ — ลองรีเฟรชหน้า
        </p>
      </CardContent>
    </Card>
  );
}

// ── KPI 1: รายจ่ายเดือนนี้ ───────────────────────────
export function SpendKpi() {
  const query = useBudgetStatus();
  if (query.isPending) return <KpiSkeleton />;
  if (!query.data) return <KpiError title="รายจ่ายเดือนนี้" />;
  const { total, firstDay, lastDay, currency } = query.data;
  const pct = total.ratio === null ? null : Math.round(total.ratio * 1000) / 10;
  const left = total.budgetMinor === null ? null : total.budgetMinor - total.spentMinor;

  return (
    <KpiCard
      title="รายจ่ายเดือนนี้"
      aside={
        pct !== null ? (
          <Badge tone="neutral" className="nums">
            {pct}% ใช้ไป
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
              ? `คงเหลือใช้ได้อีก ${baht(left, currency)} ในเดือนนี้`
              : `เกินงบ ${baht(-(left ?? 0), currency)}`}
            {total.tone !== 'safe' ? <ToneBadge tone={total.tone} /> : null}
          </p>
          <Progress
            value={total.spentMinor}
            max={total.budgetMinor}
            budget
            label="ยอดใช้เทียบงบรวมเดือนนี้"
            className="mt-auto h-2"
          />
          <p className="flex justify-between font-mono text-[11px] text-fg-secondary">
            <span>เริ่ม {shortDate(firstDay)}</span>
            <span>สิ้นสุด {shortDate(lastDay)}</span>
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
        งบรวมต่อเดือน (บาท)
      </label>
      <input
        id="total-budget"
        inputMode="decimal"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="ตั้งงบต่อเดือน เช่น 15000"
        className="h-9 min-w-0 flex-1 rounded-control border border-hairline-strong bg-surface px-3 text-sm text-fg placeholder:text-fg-tertiary focus-visible:border-accent focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
      />
      <Button type="submit" size="sm" variant="secondary" disabled={!minor || save.isPending}>
        ตั้งงบ
      </Button>
    </form>
  );
}

// ── KPI 2: คาดการณ์สิ้นเดือน ─────────────────────────
export function ForecastKpi() {
  const query = useForecast();
  if (query.isPending) return <KpiSkeleton />;
  if (!query.data) return <KpiError title="คาดการณ์สิ้นเดือน" />;
  const f = query.data;
  const marginPct =
    f.marginMinor !== null && f.budgetMinor
      ? Math.round((Math.abs(f.marginMinor) / f.budgetMinor) * 100)
      : null;

  return (
    <KpiCard
      title="คาดการณ์สิ้นเดือน"
      aside={f.budgetMinor !== null ? <ToneBadge tone={f.status} /> : null}
    >
      <p className={BIG} lang="en">
        {baht(f.projectedMinor, f.currency)}
      </p>
      <p className="text-[13px] text-fg-secondary">
        {f.marginMinor === null
          ? 'ตั้งงบรวมเพื่อดูว่าจะเกินหรือไม่'
          : f.marginMinor >= 0
            ? `ต่ำกว่าเป้าหมายงบรวม ${baht(f.marginMinor, f.currency)} (${marginPct}%)`
            : `เกินงบ ${baht(-f.marginMinor, f.currency)} (${marginPct}%)`}
      </p>
      <Sparkline
        className="mt-auto pt-1"
        points={f.series.map((p) => ({ x: p.date, y: p.cumulativeMinor }))}
        label={`ยอดใช้สะสมตั้งแต่วันที่ 1 ถึงวันที่ ${f.dayOfMonth} รวม ${baht(f.spentToDateMinor, f.currency)}${f.unpaidBillsMinor > 0 ? ` · คาดการณ์รวมบิลที่ยังไม่จ่าย ${baht(f.unpaidBillsMinor, f.currency)}` : ''}`}
        format={(y) => baht(y, f.currency)}
      />
    </KpiCard>
  );
}

// ── KPI 3: บิลประจำ ──────────────────────────────────
export function BillsKpi() {
  const query = useBills();
  if (query.isPending) return <KpiSkeleton />;
  if (!query.data) return <KpiError title="บิลประจำ" />;
  const b = query.data;
  const overdue = b.bills.filter((x) => x.daysUntilDue !== null && x.daysUntilDue < 0);

  const dueSoon = b.bills.filter(
    (x) => x.daysUntilDue !== null && x.daysUntilDue >= 0 && x.daysUntilDue < 7,
  );

  return (
    <KpiCard
      title="บิลประจำ (Fixed bills)"
      aside={<CalendarClock size={18} aria-hidden="true" className="text-fg-secondary" />}
    >
      <p className="flex items-baseline gap-2">
        <span className={BIG} lang="en">
          {baht(b.fixedMonthlyMinor, b.currency)}
        </span>
        <span className="text-sm text-fg-secondary">/ เดือน</span>
      </p>
      <p className="text-[13px] text-fg-secondary">
        ครบกำหนดใน 7 วัน <span className="nums font-medium text-fg">{b.dueSoonCount}</span> รายการ
      </p>
      {overdue.length > 0 ? (
        <p className="mt-auto flex items-center gap-2 rounded-row bg-danger-soft px-3 py-2.5 text-[13px] text-danger">
          <AlertTriangle size={16} aria-hidden="true" className="shrink-0" />
          เลยกำหนด {overdue.map((x) => x.title).join(', ')}
        </p>
      ) : dueSoon.length > 0 ? (
        <p className="mt-auto flex items-center gap-2 rounded-row bg-sunken px-3 py-2.5 text-[13px] text-fg">
          <AlertTriangle size={16} aria-hidden="true" className="shrink-0" />
          {dueSoon.map((x) => x.title).join(' & ')} ใกล้ครบกำหนด
        </p>
      ) : null}
    </KpiCard>
  );
}
