'use client';

import type { BillDto } from '@nosion/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, PlusCircle, Receipt } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { cn } from '@nosion/ui';
import { EmptyState, ErrorState } from '@/components/shared/states';
import { Card, CardContent, CardHeader, ListRow } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { entriesApi } from '@/features/entries/api';
import { ApiError } from '@/lib/api-client';
import { PAYMENT_LABEL } from './categories';
import { bahtExact, shortDate } from './format';
import { NewBillDialog } from './new-bill-dialog';
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
  const [adding, setAdding] = useState(false);
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
      {/* หัวการ์ดตาม mockup: ชื่อใหญ่ ไม่มีกล่องไอคอน */}
      <CardHeader
        title={<span className="text-xl">บิลและค่าใช้จ่ายประจำ</span>}
        description="รอบการชำระเดือนนี้ + ที่ยังค้างจ่าย"
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
            description="ตั้งรอบบิลด้านล่าง แล้วรายการจะถูกสร้างให้ทุกเดือนเอง"
          />
        ) : (
          <ul className="space-y-2">
            {query.data.bills.map((b) => (
              // บิลที่จ่ายแล้ว: ขีดฆ่า + ชิป "ชำระแล้ว" — ไม่ใช้ opacity แบบ mockup เพราะทำ contrast ตก AA (axe จับได้)
              <ListRow key={b.id} className="p-3.5">
                <span
                  aria-hidden="true"
                  className="flex size-10 shrink-0 items-center justify-center rounded-control bg-surface text-fg-secondary"
                >
                  <Receipt size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      'truncate text-[15px] font-medium',
                      b.paid && 'text-fg-secondary line-through',
                    )}
                  >
                    {b.title}
                  </p>
                  <p className="truncate font-mono text-xs text-fg-secondary">
                    ครบกำหนด {shortDate(b.dueDate)} · {PAYMENT_LABEL[b.paymentMethod]}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <span className="nums font-mono text-[15px] font-semibold">
                    {bahtExact(b.amountMinor, b.currency)}
                  </span>
                  {b.paid ? (
                    <span className="inline-flex h-6 items-center gap-1 rounded-chip bg-surface px-2.5 text-[11px] font-medium text-fg">
                      <Check size={12} aria-hidden="true" />
                      {b.paymentMethod === 'card' ? 'ตัดบัตรแล้ว' : 'ชำระแล้ว'}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => pay.mutate(b.id)}
                      disabled={pay.isPending}
                      aria-label={`ทำเครื่องหมายว่าจ่าย ${b.title} แล้ว (${dueText(b)})`}
                      className={cn(
                        'h-6 rounded-chip px-2.5 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]',
                        (b.daysUntilDue ?? 0) < 0
                          ? 'bg-danger-soft text-danger hover:bg-danger/20'
                          : 'border border-hairline-strong text-fg hover:bg-wash',
                      )}
                    >
                      {dueText(b)}
                    </button>
                  )}
                </div>
              </ListRow>
            ))}
          </ul>
        )}
        {/* ปุ่มอยู่นอกรายการ — ยังไม่มีบิลก็ตั้งรอบแรกได้จากตรงนี้ */}
        {query.isPending ? null : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-row border border-dashed border-hairline-strong text-[13px] text-fg-secondary transition-colors hover:bg-wash hover:text-fg focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
          >
            <PlusCircle size={16} aria-hidden="true" /> เพิ่มรอบบิลใหม่
          </button>
        )}
      </CardContent>
      <NewBillDialog open={adding} onClose={() => setAdding(false)} />
    </Card>
  );
}
