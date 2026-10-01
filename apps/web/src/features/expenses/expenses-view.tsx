'use client';

import { BillsCard } from './bills-card';
import { CategoryCard } from './category-card';
import { ExpenseCapture } from './expense-capture';
import { BillsKpi, ForecastKpi, SpendKpi } from './kpi-cards';
import { TransactionsCard } from './transactions-card';

/**
 * หน้า Expenses (สเปก 8.11.3) — "ตอบคำถาม 80% ได้ในหน้าเดียว"
 * บันทึกด่วน → KPI 3 การ์ด → บิล (5 col) + หมวดหมู่ (7 col) → รายการล่าสุด
 */
export function ExpensesView() {
  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="font-mono text-[11px] uppercase tracking-wider text-fg-secondary" lang="en">
          Workspace / Finance
        </p>
        <h1 className="text-[30px] font-semibold leading-tight md:text-[40px]">
          การเงิน{' '}
          <span className="text-fg-tertiary tracking-display" lang="en">
            (Finance)
          </span>
        </h1>
      </header>

      <ExpenseCapture />

      <section aria-label="ตัวชี้วัดเดือนนี้" className="grid gap-4 md:grid-cols-3">
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
