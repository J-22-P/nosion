'use client';

import { ArrowLeft, BarChart3, LineChart as LineIcon, PieChart } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { EmptyState, ErrorState } from '@/components/shared/states';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Select } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { LineChart, ShareBar, StackedColumns, type Series } from './analytics-charts';
import { CHART_BG, foldCategories } from './analytics-data';
import { CATEGORY } from './categories';
import { baht, bahtCompact, shortMonth } from './format';
import { useSummary, useTrends } from './use-expense-queries';
import { currentLocale, dateFormat, tr } from '@/i18n/current';

const longMonth = (period: string) =>
  dateFormat({ month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${period}-15T00:00:00Z`),
  );

/**
 * หน้า Analytics (สเปก 15 Phase 2b · 8.1 /expenses/analytics)
 * สัดส่วนหมวด (แท่งซ้อนแนวนอน แทน donut — เหตุผลใน phase doc) · รายรับ vs รายจ่าย 6 เดือน · fixed vs variable
 */
export function AnalyticsView() {
  const trends = useTrends(true);
  const periods = trends.data?.points.map((p) => p.period) ?? [];
  const [picked, setPicked] = useState<string | undefined>(undefined);
  const period = picked ?? periods.at(-1);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="space-y-2">
          <Link
            href="/expenses"
            className="inline-flex items-center gap-1 rounded-[4px] text-xs text-fg-secondary hover:text-fg focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
          >
            <ArrowLeft size={14} aria-hidden="true" /> {tr('analytics.back')}
          </Link>
          <h1 className="text-[30px] font-semibold leading-tight md:text-[40px]">
            {tr('analytics.title')}
            {currentLocale() === 'th' ? (
              <>
                {' '}
                <span className="text-fg-tertiary tracking-display" lang="en">
                  (Analytics)
                </span>
              </>
            ) : null}
          </h1>
        </div>
        {periods.length ? (
          <label className="flex items-center gap-2 text-sm text-fg-secondary">
            {tr('analytics.month')}
            <Select
              value={period}
              onChange={(e) => setPicked(e.target.value)}
              aria-label={tr('analytics.pickMonth')}
            >
              {[...periods].reverse().map((p) => (
                <option key={p} value={p}>
                  {longMonth(p)}
                </option>
              ))}
            </Select>
          </label>
        ) : null}
      </header>

      <ShareCard period={period} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="min-w-0">
          <CardHeader
            icon={<LineIcon />}
            title={tr('analytics.incomeVsExpense')}
            description={tr('analytics.last6')}
          />
          <CardContent>
            {trends.isPending ? (
              <Skeleton className="h-52 w-full" />
            ) : !trends.data ? (
              <ErrorState
                message={tr('analytics.trendFailed')}
                onRetry={() => void trends.refetch()}
              />
            ) : (
              <LineChart
                title={tr('analytics.incomeExpenseTitle')}
                categories={trends.data.points.map((p) => ({
                  key: p.period,
                  label: shortMonth(p.period),
                }))}
                series={[
                  { key: 'expense', label: tr('analytics.expense'), slot: 0 },
                  { key: 'income', label: tr('analytics.income'), slot: 2, dashed: true },
                ]}
                values={[
                  trends.data.points.map((p) => p.expenseMinor),
                  trends.data.points.map((p) => p.incomeMinor),
                ]}
                format={(v) => baht(v, trends.data.currency)}
                formatAxis={bahtCompact}
              />
            )}
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader
            icon={<BarChart3 />}
            title={tr('analytics.fixedVsVariable')}
            description={tr('analytics.fixedVsVariableHint')}
          />
          <CardContent>
            {trends.isPending ? (
              <Skeleton className="h-52 w-full" />
            ) : !trends.data ? (
              <ErrorState
                message={tr('analytics.trendFailed')}
                onRetry={() => void trends.refetch()}
              />
            ) : (
              <StackedColumns
                title={tr('analytics.fixedVariableTitle')}
                categories={trends.data.points.map((p) => ({
                  key: p.period,
                  label: shortMonth(p.period),
                }))}
                series={[
                  { key: 'fixed', label: tr('analytics.fixed'), slot: 0 },
                  { key: 'variable', label: tr('analytics.variable'), slot: 4 },
                ]}
                values={[
                  trends.data.points.map((p) => p.fixedMinor),
                  trends.data.points.map((p) => p.variableMinor),
                ]}
                format={(v) => baht(v, trends.data.currency)}
                formatAxis={bahtCompact}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ShareCard({ period }: { period: string | undefined }) {
  const summary = useSummary(period);
  const data = summary.data;
  const slices = data ? foldCategories(data.byCategory) : [];
  const seriesLabel = (key: string) =>
    key === 'rest' ? tr('analytics.rest') : CATEGORY[key as keyof typeof CATEGORY].label;
  const series: Series[] = slices.map((s, i) => ({
    key: s.key,
    label: seriesLabel(s.key),
    slot: i,
  }));

  return (
    <Card>
      <CardHeader
        icon={<PieChart />}
        title={tr('analytics.shareTitle')}
        description={period ? longMonth(period) : undefined}
        aside={
          data ? (
            <span className="nums font-mono text-sm">{baht(data.expenseMinor, data.currency)}</span>
          ) : null
        }
      />
      <CardContent className="space-y-4">
        {summary.isPending ? (
          <>
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-24 w-full" />
          </>
        ) : !data ? (
          <ErrorState
            message={tr('analytics.summaryFailed')}
            onRetry={() => void summary.refetch()}
          />
        ) : slices.length === 0 ? (
          <EmptyState
            title={tr('analytics.noSpending')}
            description={tr('analytics.noSpendingHint')}
          />
        ) : (
          <>
            <ShareBar
              slices={slices.map((s, i) => ({ key: s.key, share: s.share, slot: i }))}
              label={tr('analytics.shareLabel')}
            />
            {/* ตารางนี้คือ legend + ป้ายตัวเลข (มองเห็นได้) — สีบางช่อง contrast < 3:1 จึงต้องมีตัวเลขกำกับเสมอ */}
            <table className="w-full text-sm">
              <caption className="sr-only">
                {tr('analytics.tableCaption', { month: period ? longMonth(period) : '' })}
              </caption>
              <thead className="sr-only">
                <tr>
                  <th scope="col">{tr('analytics.col.category')}</th>
                  <th scope="col">{tr('analytics.col.amount')}</th>
                  <th scope="col">{tr('analytics.col.share')}</th>
                </tr>
              </thead>
              <tbody>
                {slices.map((s, i) => (
                  <tr key={s.key} className="border-b border-hairline last:border-0">
                    <th scope="row" className="py-2 text-left font-normal">
                      <span className="flex items-center gap-2">
                        <span
                          aria-hidden="true"
                          className={`size-2.5 shrink-0 rounded-[3px] ${CHART_BG[i]}`}
                        />
                        {series[i]!.label}
                        {s.folded.length ? (
                          <span className="text-xs text-fg-secondary">
                            ({s.folded.map((c) => CATEGORY[c].label).join(', ')})
                          </span>
                        ) : null}
                      </span>
                    </th>
                    <td className="nums py-2 text-right font-mono">
                      {baht(s.amountMinor, data.currency)}
                    </td>
                    <td className="nums w-16 py-2 text-right font-mono text-fg-secondary">
                      {Math.round(s.share * 100)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </CardContent>
    </Card>
  );
}
