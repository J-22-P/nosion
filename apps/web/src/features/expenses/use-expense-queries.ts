'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { expensesApi } from './api';
import { errorText } from '@/i18n/errors';
import { tr } from '@/i18n/current';

/**
 * key ขึ้นต้นด้วย 'entries' โดยตั้งใจ (เหมือน sidebar ของ Tasks) —
 * mutation ของ entry ทุกตัว invalidate ['entries'] อยู่แล้ว ตัวเลขทุกการ์ดจึงสดเองหลังบันทึก/จ่ายบิล
 */
export const EXPENSE_KEYS = {
  status: ['entries', 'expenses', 'budget-status'] as const,
  forecast: ['entries', 'expenses', 'forecast'] as const,
  bills: ['entries', 'expenses', 'bills'] as const,
  trends: ['entries', 'expenses', 'trends'] as const,
  summary: (period: string) => ['entries', 'expenses', 'summary', period] as const,
  budgets: ['budgets'] as const,
};

export const useBudgetStatus = () =>
  useQuery({
    queryKey: EXPENSE_KEYS.status,
    queryFn: () => expensesApi.budgetStatus(),
    staleTime: 30_000,
  });

export const useForecast = () =>
  useQuery({ queryKey: EXPENSE_KEYS.forecast, queryFn: expensesApi.forecast, staleTime: 30_000 });

export const useBills = () =>
  useQuery({
    queryKey: EXPENSE_KEYS.bills,
    queryFn: () => expensesApi.bills(7),
    staleTime: 30_000,
  });

/** แท็บ "แนวโน้ม" — โหลดเมื่อเปิดแท็บเท่านั้น (enabled) */
export const useTrends = (enabled: boolean) =>
  useQuery({
    queryKey: EXPENSE_KEYS.trends,
    queryFn: () => expensesApi.trends(6),
    staleTime: 5 * 60_000,
    enabled,
  });

/** หน้า Analytics: สรุปของเดือนที่เลือก */
export const useSummary = (period: string | undefined) =>
  useQuery({
    queryKey: EXPENSE_KEYS.summary(period ?? 'current'),
    queryFn: () => expensesApi.summary(period),
    staleTime: 60_000,
    placeholderData: (previous) => previous, // เปลี่ยนเดือนแล้วไม่กระพริบ
  });

/** ตั้ง/แก้ "งบรวม" ของเดือน — มีก้อนเดียว (partial unique index ฝั่ง DB) */
export function useSetTotalBudget() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (amountMinor: number) => {
      const budgets = await expensesApi.budgets();
      const total = budgets.find((b) => b.category === null);
      return total
        ? expensesApi.updateBudget(total.id, { amountMinor, isActive: true })
        : expensesApi.createBudget({ category: null, amountMinor, alertThreshold: 80 });
    },
    onSuccess: () => toast.success(tr('expenseQ.budgetSaved')),
    onError: (error) =>
      toast.error(tr('expenseQ.budgetFailed'), {
        description: errorText(error),
      }),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['entries'] });
      void queryClient.invalidateQueries({ queryKey: EXPENSE_KEYS.budgets });
    },
  });
}
