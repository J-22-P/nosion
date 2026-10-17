'use client';

import { BarChart3 } from 'lucide-react';
import { shortDate } from './format';
import { useBudgetStatus } from './use-expense-queries';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { BillsCard } from './bills-card';
import { CategoryCard } from './category-card';
import { ExpenseCapture } from './expense-capture';
import { BillsKpi, ForecastKpi, SpendKpi } from './kpi-cards';
import { TransactionsCard } from './transactions-card';
import { tr } from '@/i18n/current';
import { useFocusNewOnParam } from '@/lib/shortcuts/use-focus-new';

/**
 * หน้า Expenses (สเปก 8.11.3) — "ตอบคำถาม 80% ได้ในหน้าเดียว"
 * บันทึกด่วน → KPI 3 การ์ด → บิล (5 col) + หมวดหมู่ (7 col) → รายการล่าสุด
 */
export function ExpensesView() {
  useFocusNewOnParam();
  return (
    <div className="space-y-6">
      {/* mockup ไม่มีหัวข้อใหญ่ — เริ่มด้วยแถบบันทึกด่วน · h1 คงไว้ให้ screen reader + บรรทัดสถานะเล็ก (mockup มือถือ) */}
      <header className="flex items-center justify-between gap-3">
        <h1 className="sr-only">{tr('expensesView.title')}</h1>
        <p className="flex items-center gap-2 text-xs text-fg-secondary">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-track-fill" />
          <MonthLabel />
        </p>
        <Link href="/expenses/analytics">
          <Button variant="secondary" size="sm" shape="pill" className="gap-1.5">
            <BarChart3 size={14} aria-hidden="true" /> {tr('expensesView.analytics')}
          </Button>
        </Link>
      </header>

      <ExpenseCapture />

      <section aria-label={tr('expensesView.kpis')} className="grid gap-4 md:grid-cols-3">
        <SpendKpi />
        <ForecastKpi />
        <BillsKpi />
      </section>

      <div className="grid gap-4 lg:grid-cols-12">
        <BillsCard className="lg:col-span-5" />
        <CategoryCard className="lg:col-span-7" />
      </div>

      <TransactionsCard />
    </div>
  );
}

/** "งบประมาณ 1 ก.ย. – 30 ก.ย." จาก /budgets/status (ใช้ cache เดียวกับ KPI 1) */
function MonthLabel() {
  const status = useBudgetStatus();
  if (!status.data) return <span>{tr('expensesView.budgetMonth')}</span>;
  return (
    <span>
      {tr('expensesView.budgetRange', {
        from: shortDate(status.data.firstDay),
        to: shortDate(status.data.lastDay),
      })}
    </span>
  );
}
