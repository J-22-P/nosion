'use client';

import type { BillDto } from '@nosion/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Receipt } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@nosion/ui';
import { EmptyState, ErrorState } from '@/components/shared/states';
import { Card, CardContent, CardHeader, ListRow } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { entriesApi } from '@/features/entries/api';
import { ApiError } from '@/lib/api-client';
import { bahtExact, shortDate } from './format';
import { useBills } from './use-expense-queries';

function dueText(b: BillDto): string {
  const d = b.daysUntilDue ?? 0;
  if (d < 0) return `เลยกำหนด ${-d} วัน`;
  if (d === 0) return 'ครบกำหนดวันนี้';
  if (d === 1) return 'ครบกำหนดพรุ่งนี้';
  return `ครบกำหนด ${shortDate(b.dueDate)}`;
}

/** บิลและค่าใช้จ่ายประจำ (สเปก 8.11.3) — กดปุ่มสถานะ = จ่ายแล้ว (POST /entries/:id/complete) */
export function BillsCard({ className }: { className?: string }) {
  const query = useBills();
  const queryClient = useQueryClient();
  const pay = useMutation({
    mutationFn: (id: string) => entriesApi.complete(id),
    onSuccess: (entry) => toast.success('บันทึกว่าจ่ายแล้ว', { description: entry.title }),
    onError: (error) =>
      toast.error('บันทึกการจ่ายไม่สำเร็จ', {
        description: error instanceof ApiError ? error.message : undefined,
      }),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ['entries'] }),
  });

  return (
    <Card className={className}>
      <CardHeader
        icon={<Receipt />}
        title="บิลและค่าใช้จ่ายประจำ"
        description="เดือนนี้ + ที่ยังค้างจ่าย"
      />
      <CardContent>
        {query.isPending ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-14 w-full rounded-row" />
            ))}
          </div>
        ) : !query.data ? (
          <ErrorState message="โหลดรายการบิลไม่สำเร็จ" onRetry={() => void query.refetch()} />
        ) : query.data.bills.length === 0 ? (
          <EmptyState
            title="ยังไม่มีบิลประจำ"
            description="พิมพ์ในช่องบันทึกด่วน เช่น “ค่าเน็ต 799 ทุกวันที่ 5”"
          />
        ) : (
          <ul className="space-y-2">
            {query.data.bills.map((b) => (
              <ListRow key={b.id} className="p-3.5">
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      'truncate text-sm font-medium',
                      b.paid && 'text-fg-secondary line-through',
                    )}
                  >
                    {b.title}
                  </p>
                  <p className="nums font-mono text-xs text-fg-secondary">
                    {bahtExact(b.amountMinor, b.currency)}
                  </p>
                </div>
                {b.paid ? (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
                    <Check size={14} aria-hidden="true" />
                    {b.paymentMethod === 'card' ? 'ตัดบัตรแล้ว' : 'ชำระแล้ว'}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => pay.mutate(b.id)}
                    disabled={pay.isPending}
                    aria-label={`ทำเครื่องหมายว่าจ่าย ${b.title} แล้ว (${dueText(b)})`}
                    className={cn(
                      'h-8 shrink-0 rounded-chip px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]',
                      (b.daysUntilDue ?? 0) < 0
                        ? 'bg-danger-soft text-danger hover:bg-danger/20'
                        : 'border border-hairline-strong text-fg hover:bg-wash',
                    )}
                  >
                    {dueText(b)}
                  </button>
                )}
              </ListRow>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
