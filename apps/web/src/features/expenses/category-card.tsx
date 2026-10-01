'use client';

import { PieChart } from 'lucide-react';
import { useState } from 'react';
import { EmptyState, ErrorState } from '@/components/shared/states';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Skeleton } from '@/components/ui/skeleton';
import { CATEGORY } from './categories';
import { ColumnChart } from './charts';
import { baht, bahtCompact, shortMonth } from './format';
import { ToneBadge } from './kpi-cards';
import { useBudgetStatus, useTrends } from './use-expense-queries';

type Tab = 'budget' | 'trend';

/** สัดส่วนตามหมวดหมู่ (สเปก 8.11.3): segmented งบประมาณ / แนวโน้ม 6 เดือน */
export function CategoryCard({ className }: { className?: string }) {
  const [tab, setTab] = useState<Tab>('budget');
  const control = (
    <SegmentedControl<Tab>
      label="มุมมองหมวดหมู่"
      value={tab}
      onChange={setTab}
      options={[
        { value: 'budget', label: 'งบประมาณ' },
        { value: 'trend', label: 'แนวโน้ม' },
      ]}
    />
  );
  return (
    <Card className={className}>
      {/* มือถือ: ตัวสลับอยู่ใต้หัวการ์ด — วางข้างหัวแล้วชื่อการ์ดถูกบีบจนตัดเป็นคำละบรรทัด */}
      <CardHeader
        icon={<PieChart />}
        title="สัดส่วนตามหมวดหมู่"
        description="คำนวณจากหมวดของแต่ละรายการ"
        aside={<div className="hidden sm:block">{control}</div>}
      />
      <CardContent>
        <div className="mb-4 sm:hidden">{control}</div>
        {tab === 'budget' ? <BudgetBars /> : <Trend />}
      </CardContent>
    </Card>
  );
}

function BudgetBars() {
  const query = useBudgetStatus();
  if (query.isPending) {
    return (
      <div className="space-y-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    );
  }
  if (!query.data)
    return <ErrorState message="โหลดงบรายหมวดไม่สำเร็จ" onRetry={() => void query.refetch()} />;
  const { categories, currency } = query.data;
  if (categories.length === 0) {
    return (
      <EmptyState title="ยังไม่มีรายจ่ายเดือนนี้" description="บันทึกรายการแรกจากช่องด้านบน" />
    );
  }
  return (
    <ul className="space-y-4">
      {categories.map((c) => {
        const meta = CATEGORY[c.category];
        const pct = c.ratio === null ? null : Math.round(c.ratio * 100);
        return (
          <li key={c.category} className="space-y-1.5">
            <div className="flex items-center gap-2 text-sm">
              <meta.icon size={16} className="shrink-0 text-fg-secondary" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate font-medium">{meta.label}</span>
              <span className="nums font-mono text-xs text-fg-secondary">
                {baht(c.spentMinor, currency)}
                {c.budgetMinor !== null ? ` / ${baht(c.budgetMinor, currency)} (${pct}%)` : ''}
              </span>
              {c.tone !== 'safe' ? <ToneBadge tone={c.tone} /> : null}
            </div>
            {c.budgetMinor !== null ? (
              <Progress
                value={c.spentMinor}
                max={c.budgetMinor}
                budget
                label={`งบหมวด${meta.label}`}
              />
            ) : (
              <p className="text-xs text-fg-secondary">ยังไม่ได้ตั้งงบหมวดนี้</p>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Trend() {
  const query = useTrends(true);
  if (query.isPending) return <Skeleton className="h-40 w-full" />;
  if (!query.data)
    return <ErrorState message="โหลดแนวโน้มไม่สำเร็จ" onRetry={() => void query.refetch()} />;
  const { points, currency } = query.data;
  return (
    <ColumnChart
      title="รายจ่ายรวม 6 เดือนล่าสุด"
      columns={points.map((p, i) => ({
        key: p.period,
        label: shortMonth(p.period),
        value: p.expenseMinor,
        partial: i === points.length - 1,
      }))}
      format={(v) => baht(v, currency)}
      formatAxis={bahtCompact}
    />
  );
}
