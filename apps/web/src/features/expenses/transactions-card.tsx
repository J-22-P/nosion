'use client';

import type { EntryDto, ExpensePayload } from '@nosion/contracts';
import { Download } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { EmptyState, ErrorState } from '@/components/shared/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { entriesApi, type EntryFilters } from '@/features/entries/api';
import { useEntries } from '@/features/entries/use-entries';
import { downloadText, toCsv } from '@/lib/csv';
import { formatDueDate } from '@/lib/format';
import { CATEGORY, PAYMENT_LABEL } from './categories';
import { bahtExact, timeOf } from './format';
import { useBudgetStatus } from './use-expense-queries';

const RECENT: EntryFilters = { module: 'expense', sort: 'occurredAt:desc', limit: 8 };

const payloadOf = (e: EntryDto) => e.payload as ExpensePayload;

function whenLabel(e: EntryDto): string {
  if (!e.occurredAt) return '—';
  const day = formatDueDate(e.occurredAt) ?? '';
  return e.isAllDay ? day : `${day} ${timeOf(e.occurredAt)}`;
}

function Amount({ e }: { e: EntryDto }) {
  const p = payloadOf(e);
  const income = p.direction === 'income';
  return (
    // monochrome ตาม mockup — รายรับบอกด้วยเครื่องหมาย + ไม่ใช่สีเขียว
    <span className="nums font-mono text-[15px] font-semibold text-fg">
      {income ? '+' : '−'}
      {bahtExact(Math.abs(p.amountMinor), p.currency)}
    </span>
  );
}

/** รายการล่าสุด (สเปก 8.11.3) — desktop ตาราง · มือถือ list 2 บรรทัด · ⤓ = CSV ทั้งเดือน */
export function TransactionsCard({ className }: { className?: string }) {
  const query = useEntries(RECENT);
  const status = useBudgetStatus();
  const [exporting, setExporting] = useState(false);
  const rows = (query.data?.data ?? []).filter((e) => e.status !== 'cancelled');

  async function exportMonth() {
    if (!status.data) return;
    setExporting(true);
    try {
      const { firstDay, lastDay, period } = status.data;
      const all: EntryDto[] = [];
      let cursor: string | undefined;
      // ไล่ทุกหน้า (หน้าละ 100) — เดือนหนึ่งของคนหนึ่งคนไม่กี่หน้า
      do {
        const page = await entriesApi.list({
          module: 'expense',
          from: firstDay,
          to: lastDay,
          sort: 'occurredAt:asc',
          limit: 100,
          cursor,
        });
        all.push(...page.data);
        cursor = page.pageInfo.nextCursor ?? undefined;
      } while (cursor);

      const csv = toCsv([
        [
          'วันที่',
          'รายการ',
          'หมวด',
          'ประเภทต้นทุน',
          'วิธีจ่าย',
          'ทิศทาง',
          'จำนวนเงิน',
          'สกุลเงิน',
          'สถานะ',
        ],
        ...all.map((e) => {
          const p = payloadOf(e);
          return [
            e.occurredAt ?? '',
            e.title,
            CATEGORY[p.category].label,
            p.costType === 'fixed' ? 'คงที่' : 'ผันแปร',
            PAYMENT_LABEL[p.paymentMethod],
            p.direction === 'income' ? 'รายรับ' : 'รายจ่าย',
            // จำนวนเงินเป็นตัวเลขล้วน (ไม่มี ฿/ลูกน้ำ) ให้ Excel คำนวณต่อได้
            ((p.direction === 'income' ? 1 : -1) * p.amountMinor) / 100,
            p.currency,
            e.status,
          ];
        }),
      ]);
      downloadText(`nosion-expenses-${period}.csv`, csv);
      toast.success(`ส่งออก ${all.length} รายการแล้ว`);
    } catch {
      toast.error('ส่งออก CSV ไม่สำเร็จ');
    } finally {
      setExporting(false);
    }
  }

  return (
    <Card className={className}>
      <CardHeader
        title={
          <span className="text-xl">
            รายการใช้จ่ายล่าสุด <span className="text-fg-secondary">(Transactions)</span>
          </span>
        }
        description="บันทึกธุรกรรมล่าสุดของเดือนนี้"
        aside={
          <Button
            variant="secondary"
            size="icon"
            shape="circle"
            onClick={() => void exportMonth()}
            disabled={exporting || !status.data}
            aria-label="ส่งออกรายการของเดือนนี้เป็น CSV"
          >
            <Download size={16} aria-hidden="true" />
          </Button>
        }
      />
      <CardContent>
        {query.isPending ? (
          <div className="space-y-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : query.isError && !query.data ? (
          <ErrorState message="โหลดรายการไม่สำเร็จ" onRetry={() => void query.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState title="ยังไม่มีรายการ" description="ลองพิมพ์ “กาแฟ 65” ในช่องบันทึกด่วน" />
        ) : (
          <>
            {/* desktop: ตาราง */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-fg-secondary">
                  <tr className="border-b border-hairline">
                    <th scope="col" className="pb-2 font-medium">
                      วันที่/เวลา
                    </th>
                    <th scope="col" className="pb-2 font-medium">
                      รายการ
                    </th>
                    <th scope="col" className="pb-2 font-medium">
                      หมวดหมู่
                    </th>
                    <th scope="col" className="pb-2 font-medium">
                      ประเภทต้นทุน
                    </th>
                    <th scope="col" className="pb-2 text-right font-medium">
                      จำนวนเงิน
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((e) => {
                    const p = payloadOf(e);
                    return (
                      <tr key={e.id} className="border-b border-hairline last:border-0">
                        <td className="whitespace-nowrap py-3.5 pr-4 font-mono text-xs text-fg-secondary">
                          {whenLabel(e)}
                        </td>
                        <td className="py-3.5 pr-4">
                          <div className="flex items-center gap-3">
                            <CategoryIcon category={p.category} />
                            <div className="min-w-0">
                              <p className="font-medium">{e.title}</p>
                              <p className="font-mono text-xs text-fg-secondary">
                                {[p.merchant, PAYMENT_LABEL[p.paymentMethod], p.note]
                                  .filter(Boolean)
                                  .join(' · ')}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3.5 pr-4">
                          <span className="inline-flex h-6 items-center rounded-chip bg-wash-active px-2.5 text-xs font-medium">
                            {CATEGORY[p.category].label}
                          </span>
                        </td>
                        <td className="py-3.5 pr-4 text-xs text-fg-secondary">
                          {p.costType === 'fixed' ? 'คงที่ (FIXED)' : 'ผันแปร (VARIABLE)'}
                        </td>
                        <td className="py-3.5 text-right">
                          <Amount e={e} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {/* มือถือ: list 2 บรรทัด ไม่มีตาราง */}
            <ul className="divide-y divide-hairline md:hidden">
              {rows.map((e) => {
                const p = payloadOf(e);
                return (
                  <li key={e.id} className="flex items-center gap-3 py-3">
                    <CategoryIcon category={p.category} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{e.title}</p>
                      <p className="truncate text-xs text-fg-secondary">
                        {whenLabel(e)} · {CATEGORY[p.category].label}
                      </p>
                    </div>
                    <Amount e={e} />
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 border-t border-hairline pt-3 text-xs text-fg-secondary">
              แสดง {rows.length} รายการล่าสุด · ส่งออกทั้งเดือนด้วยปุ่ม CSV
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** ไอคอนหมวดในกล่อง 40px (mockup) — ไอคอนบอกหมวด ไม่ใช่สี */
function CategoryIcon({ category }: { category: keyof typeof CATEGORY }) {
  const Icon = CATEGORY[category].icon;
  return (
    <span
      aria-hidden="true"
      className="flex size-10 shrink-0 items-center justify-center rounded-control bg-sunken text-fg"
    >
      <Icon size={18} />
    </span>
  );
}
