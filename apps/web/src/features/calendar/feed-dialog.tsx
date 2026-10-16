'use client';

import { Copy, RefreshCw, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { copyText } from '@/features/today/use-today';
import { useCalendarFeed, useRotateFeed } from './use-calendar';

/**
 * "Subscribe iCal" (สเปก 8.11.4) — คัดลอกลิงก์ไปใส่ Google / Apple Calendar + ปุ่มสร้างลิงก์ใหม่
 * ลิงก์คือ credential: ใครได้ลิงก์ไปอ่านปฏิทินได้ → สร้างใหม่ได้ทันทีถ้าหลุด (ต้องกดยืนยันสองครั้ง)
 */
export function FeedDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="feed-title"
      className="m-auto w-[min(560px,calc(100vw-32px))] rounded-panel border border-hairline bg-surface p-0 text-fg shadow-float backdrop:bg-black/40"
    >
      <div className="flex items-center justify-between gap-3 border-b border-hairline px-5 py-4">
        <h2 id="feed-title" className="text-base font-semibold">
          Subscribe ปฏิทิน (iCal)
        </h2>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="ปิด">
          <X size={16} aria-hidden="true" />
        </Button>
      </div>
      {open ? <FeedBody /> : null}
    </dialog>
  );
}

function FeedBody() {
  const feed = useCalendarFeed(true);
  const rotate = useRotateFeed();
  const [confirming, setConfirming] = useState(false);

  async function copy(url: string) {
    if (await copyText(url)) toast.success('คัดลอกลิงก์แล้ว');
    else toast.error('คัดลอกไม่ได้ — เลือกข้อความในช่องแล้วคัดลอกเอง');
  }

  return (
    <div className="space-y-4 p-5 text-sm">
      <p className="text-fg-secondary">
        ใส่ลิงก์นี้ใน Google Calendar (เพิ่มปฏิทิน → จาก URL) หรือ Apple Calendar
        เพื่อเห็นงานและบิลของ NOSION ข้างนัดหมายอื่น · ปฏิทินภายนอกดึงข้อมูลใหม่เองทุกไม่กี่ชั่วโมง
      </p>

      {feed.data ? (
        <>
          <div className="flex gap-2">
            <Input
              readOnly
              value={feed.data.url}
              aria-label="ลิงก์ iCal"
              className="font-mono text-xs"
              onFocus={(e) => e.currentTarget.select()}
            />
            <Button variant="secondary" onClick={() => copy(feed.data.url)} className="gap-1.5">
              <Copy size={14} aria-hidden="true" /> คัดลอก
            </Button>
          </div>
          <a href={feed.data.webcalUrl} className="inline-block text-accent hover:underline">
            เปิดใน Apple Calendar
          </a>
        </>
      ) : feed.isError ? (
        <p role="alert" className="text-danger">
          โหลดลิงก์ไม่สำเร็จ
        </p>
      ) : (
        <Skeleton className="h-10 w-full" />
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline pt-4">
        <p className="max-w-xs text-xs text-fg-secondary">
          ใครมีลิงก์นี้อ่านปฏิทินของคุณได้ — ถ้าเผลอแชร์ให้สร้างลิงก์ใหม่ ลิงก์เดิมจะใช้ไม่ได้ทันที
        </p>
        <Button
          variant={confirming ? 'danger' : 'secondary'}
          size="sm"
          className="gap-1.5"
          disabled={rotate.isPending}
          onClick={() => {
            if (!confirming) return setConfirming(true);
            rotate.mutate(undefined, { onSettled: () => setConfirming(false) });
          }}
        >
          <RefreshCw size={14} aria-hidden="true" />
          {confirming ? 'ยืนยัน: ยกเลิกลิงก์เดิม' : 'สร้างลิงก์ใหม่'}
        </Button>
      </div>
    </div>
  );
}
