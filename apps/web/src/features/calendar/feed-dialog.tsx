'use client';

import type { ModuleKey } from '@nosion/contracts';
import { Copy, Download, Info, RefreshCw, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Skeleton } from '@/components/ui/skeleton';
import { copyText } from '@/features/today/use-today';
import { errorText } from '@/i18n/errors';
import { calendarApi } from './api';
import { monthTitle } from './grid';
import { useCalendarFeed, useRotateFeed } from './use-calendar';
import { tr } from '@/i18n/current';

type Mode = 'subscribe' | 'month';

/**
 * "Subscribe iCal" (สเปก 8.11.4) — สองทางเลือก
 *  - subscribe: ลิงก์ที่ Google / Apple ดึงซ้ำเอง (งานทุกชิ้น ย้อน 30 วัน–ล่วงหน้า 180 วัน) + ปุ่มสร้างลิงก์ใหม่
 *    ลิงก์คือ credential: ใครได้ลิงก์ไปอ่านปฏิทินได้ → สร้างใหม่ได้ทันทีถ้าหลุด (ต้องกดยืนยันสองครั้ง)
 *  - month: ดาวน์โหลด .ics ของเดือนที่เปิดดูอยู่ (ตามตัวกรองโมดูล) นำเข้าครั้งเดียว ไม่อัปเดตตาม
 */
export function FeedDialog({
  open,
  onClose,
  month,
  modules,
}: {
  open: boolean;
  onClose: () => void;
  /** 'YYYY-MM' ของเดือนที่เปิดดูอยู่ */
  month: string;
  /** ตัวกรองโมดูลบนหน้า (null = ทุกโมดูล) */
  modules: ModuleKey[] | null;
}) {
  const [mode, setMode] = useState<Mode>('subscribe');
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
          {tr('feed.title')}
        </h2>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label={tr('feed.close')}>
          <X size={16} aria-hidden="true" />
        </Button>
      </div>
      {open ? (
        <div className="px-5 pt-4">
          <SegmentedControl<Mode>
            label={tr('feed.modeLabel')}
            value={mode}
            onChange={setMode}
            options={[
              { value: 'subscribe', label: tr('feed.modeSubscribe') },
              { value: 'month', label: tr('feed.modeMonth') },
            ]}
          />
        </div>
      ) : null}
      {open ? (
        mode === 'subscribe' ? (
          <FeedBody />
        ) : (
          <MonthExport month={month} modules={modules} />
        )
      ) : null}
    </dialog>
  );
}

function FeedBody() {
  const feed = useCalendarFeed(true);
  const rotate = useRotateFeed();
  const [confirming, setConfirming] = useState(false);

  async function copy(url: string) {
    if (await copyText(url)) toast.success(tr('feed.copied'));
    else toast.error(tr('feed.copyFailed'));
  }

  return (
    <div className="space-y-4 p-5 text-sm">
      <p className="text-fg-secondary">{tr('feed.intro')}</p>

      {feed.data ? (
        <>
          <div className="flex gap-2">
            <Input
              readOnly
              value={feed.data.url}
              aria-label={tr('feed.link')}
              className="font-mono text-xs"
              onFocus={(e) => e.currentTarget.select()}
            />
            <Button variant="secondary" onClick={() => copy(feed.data.url)} className="gap-1.5">
              <Copy size={14} aria-hidden="true" /> {tr('feed.copy')}
            </Button>
          </div>
          <a href={feed.data.webcalUrl} className="inline-block text-accent hover:underline">
            {tr('feed.openApple')}
          </a>
          {/* Apple ไม่ยอมให้ subscribe URL เดิมซ้ำ ("This is a duplicate calendar") — ของเดิมอัปเดตเองอยู่แล้ว */}
          <div className="flex gap-2.5 rounded-row bg-sunken p-3 text-xs text-fg-secondary">
            <Info size={14} aria-hidden="true" className="mt-0.5 shrink-0" />
            <div className="space-y-1">
              <p className="font-medium text-fg">{tr('feed.alreadyTitle')}</p>
              <p>{tr('feed.alreadyBody')}</p>
            </div>
          </div>
        </>
      ) : feed.isError ? (
        <p role="alert" className="text-danger">
          {tr('feed.loadFailed')}
        </p>
      ) : (
        <Skeleton className="h-10 w-full" />
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline pt-4">
        <p className="max-w-xs text-xs text-fg-secondary">{tr('feed.warning')}</p>
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
          {confirming ? tr('feed.confirmRotate') : tr('feed.rotate')}
        </Button>
      </div>
    </div>
  );
}

/** ดาวน์โหลด .ics ของทั้งเดือน — เปิดไฟล์แล้ว Apple/Google ถามว่าจะนำเข้าปฏิทินไหน */
function MonthExport({ month, modules }: { month: string; modules: ModuleKey[] | null }) {
  const [busy, setBusy] = useState(false);
  const from = `${month}-01`;
  const [y, m] = month.split('-').map(Number);
  // วันที่ 0 ของเดือนถัดไป = วันสุดท้ายของเดือนนี้
  const to = `${month}-${String(new Date(Date.UTC(y!, m!, 0)).getUTCDate()).padStart(2, '0')}`;

  async function download() {
    setBusy(true);
    try {
      const ics = await calendarApi.exportIcs(from, to, modules ?? undefined);
      const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `nosion-${month}.ics`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      toast.error(tr('feed.exportFailed'), { description: errorText(error) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 p-5 text-sm">
      <p className="text-fg-secondary">{tr('feed.monthIntro', { month: monthTitle(from) })}</p>
      {modules ? <p className="text-xs text-fg-secondary">{tr('feed.monthFiltered')}</p> : null}
      <Button onClick={() => void download()} disabled={busy} className="gap-1.5">
        <Download size={14} aria-hidden="true" />
        {tr('feed.downloadMonth', { month: monthTitle(from) })}
      </Button>
      <p className="text-xs text-fg-secondary">{tr('feed.monthNote')}</p>
    </div>
  );
}
