'use client';

import { Copy, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { copyText, useStandup } from './use-today';

/**
 * Sheet "สร้าง Standup" (สเปก 8.11.1) — preview markdown + ปุ่มคัดลอก
 * ใช้ <dialog> ของเบราว์เซอร์: showModal() ให้ focus trap, Esc ปิด และ ::backdrop มาเอง
 * (ไม่ต้องเขียน focus trap เอง — ทางลัดที่ถูกต้องตามบท 11)
 */
export function StandupSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const standup = useStandup(open);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  async function copy() {
    if (!standup.data) return;
    const ok = await copyText(standup.data.markdown);
    if (ok) toast.success('คัดลอก Standup แล้ว');
    else toast.error('คัดลอกไม่สำเร็จ', { description: 'เลือกข้อความในกล่องแล้วคัดลอกเองได้' });
  }

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="standup-title"
      className="m-auto w-[min(640px,calc(100vw-32px))] rounded-panel border border-hairline bg-surface p-0 text-fg shadow-float backdrop:bg-black/40"
    >
      <div className="flex items-center justify-between gap-3 border-b border-hairline px-5 py-4">
        <h2 id="standup-title" className="text-base font-semibold">
          Standup วันนี้
        </h2>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="ปิด">
          <X size={16} aria-hidden="true" />
        </Button>
      </div>
      {/* เนื้อหาเฉพาะตอนเปิด — query ปิดอยู่ (enabled: false) จะค้าง isPending ทิ้ง skeleton ไว้ใน dialog ที่ซ่อนอยู่ */}
      {open ? (
        <div className="space-y-4 p-5">
          {standup.isPending ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          ) : standup.data ? (
            <>
              <p className="text-xs text-fg-secondary">
                เสร็จ {standup.data.done.length} · กำลังทำ {standup.data.doing.length} · ติดอยู่{' '}
                {standup.data.blocked.length}
              </p>
              <textarea
                readOnly
                value={standup.data.markdown}
                aria-label="Standup markdown"
                rows={12}
                className="w-full resize-none rounded-control border border-hairline bg-sunken p-3 font-mono text-[13px] leading-relaxed text-fg focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
              />
            </>
          ) : (
            <p role="alert" className="text-sm text-fg-secondary">
              สร้าง Standup ไม่สำเร็จ — ลองใหม่อีกครั้ง
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              ปิด
            </Button>
            <Button onClick={copy} disabled={!standup.data} className="gap-2">
              <Copy size={14} aria-hidden="true" /> คัดลอก Markdown
            </Button>
          </div>
        </div>
      ) : null}
    </dialog>
  );
}
