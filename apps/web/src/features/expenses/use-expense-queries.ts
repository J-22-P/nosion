'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api-client';
import { expensesApi } from './api';

/**
 * key ขึ้นต้นด้วย 'entries' โดยตั้งใจ (เหมือน sidebar ของ Tasks) —
 * mutation ของ entry ทุกตัว invalidate ['entries'] อยู่แล้ว ตัวเลขทุกการ์ดจึงสดเองหลังบันทึก/จ่ายบิล
 */
export const EXPENSE_KEYS = {
  status: ['entries', 'expenses', 'budget-status'] as const,
  forecast: ['entries', 'expenses', 'forecast'] as const,
  bills: ['entries', 'expenses', 'bills'] as const,
  trends: ['entries', 'expenses', 'trends'] as const,
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
    onSuccess: () => toast.success('บันทึกงบประมาณแล้ว'),
    onError: (error) =>
      toast.error('บันทึกงบไม่สำเร็จ', {
        description: error instanceof ApiError ? error.message : undefined,
      }),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['entries'] });
      void queryClient.invalidateQueries({ queryKey: EXPENSE_KEYS.budgets });
    },
  });
}
