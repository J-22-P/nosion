import type {
  BillsUpcomingDto,
  BudgetDto,
  BudgetStatusDto,
  CreateBudgetInput,
  ExpenseForecastDto,
  ExpenseParseDto,
  ExpenseSummaryDto,
  ExpenseTrendsDto,
  UpdateBudgetInput,
} from '@nosion/contracts';
import { apiFetch, toQuery } from '@/lib/api-client';

/** endpoint เฉพาะโมดูลการเงิน (CRUD ของรายการยังอยู่ที่ features/entries/api.ts) */
export const expensesApi = {
  budgetStatus: (period?: string) =>
    apiFetch<BudgetStatusDto>(`/budgets/status${toQuery({ period })}`),
  forecast: () => apiFetch<ExpenseForecastDto>('/expenses/forecast'),
  bills: (days = 7) => apiFetch<BillsUpcomingDto>(`/expenses/bills/upcoming${toQuery({ days })}`),
  trends: (months = 6) => apiFetch<ExpenseTrendsDto>(`/expenses/trends${toQuery({ months })}`),
  summary: (period?: string) =>
    apiFetch<ExpenseSummaryDto>(`/expenses/summary${toQuery({ period })}`),
  parse: (text: string) =>
    apiFetch<ExpenseParseDto>('/expenses/parse', { method: 'POST', body: { text } }),
  budgets: () => apiFetch<BudgetDto[]>('/budgets'),
  createBudget: (input: CreateBudgetInput) =>
    apiFetch<BudgetDto>('/budgets', { method: 'POST', body: input }),
  updateBudget: (id: string, input: UpdateBudgetInput) =>
    apiFetch<BudgetDto>(`/budgets/${id}`, { method: 'PATCH', body: input }),
};
