'use client';

import { Copy, Inbox, RefreshCw, Sparkles } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { cn } from '@nosion/ui';
import { ErrorState } from '@/components/shared/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Kbd } from '@/components/ui/kbd';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusPill } from '@/components/ui/status-pill';
import { useOnlineStatus } from '@/lib/use-online-status';
import { todayApi } from './api';
import { desktopSpan, isTypingTarget } from './layout';
import { StandupSheet } from './standup-sheet';
import { copyText, useToday } from './use-today';
import { WidgetCard } from './widgets';

const SPAN = { 5: 'lg:col-span-5', 7: 'lg:col-span-7', 12: 'lg:col-span-12' } as const;

/** "วันพฤหัสบดีที่ 1 ตุลาคม 2569" — date เป็นวันที่ตามปฏิทินของผู้ใช้ จึงจัดรูปแบบใน UTC ไม่ให้เลื่อนวัน */
function longDate(ymd: string): string {
  return new Intl.DateTimeFormat('th-TH', { dateStyle: 'full', timeZone: 'UTC' }).format(
    new Date(`${ymd}T12:00:00Z`),
  );
}

/** "Asia/Bangkok (UTC+7)" */
function zoneLabel(timeZone: string): string {
  const offset =
    new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'shortOffset' })
      .formatToParts(new Date())
      .find((p) => p.type === 'timeZoneName')?.value ?? '';
  return `${timeZone} (${offset.replace('GMT', 'UTC') || 'UTC'})`;
}

/** หน้า Today (สเปก 8.11.1) — การ์ดทั้งหมดมาจาก GET /today ในคำขอเดียว */
export function TodayView() {
  const query = useToday();
  const online = useOnlineStatus();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const standupOpen = params.get('standup') === '1';

  // เปิด/ปิด sheet ผ่าน URL → ปุ่มในการ์ดงาน (/today?standup=1) และปุ่ม back ของเบราว์เซอร์ใช้ได้เหมือนกัน
  const setStandup = useCallback(
    (open: boolean) => router.replace(open ? `${pathname}?standup=1` : pathname, { scroll: false }),
    [router, pathname],
  );

  // shortcut "s" = สร้าง Standup (สเปก 8.4) · ไม่ทำงานระหว่างพิมพ์หรือกดคู่กับปุ่มอื่น
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 's' || e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return;
      e.preventDefault();
      setStandup(true);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setStandup]);

  async function copyStandup() {
    try {
      const { markdown } = await todayApi.standup();
      if (await copyText(markdown)) toast.success('คัดลอก Standup Markdown แล้ว');
      else setStandup(true); // คัดลอกไม่ได้ → เปิด sheet ให้เลือกข้อความเอง
    } catch {
      toast.error('สร้าง Standup ไม่สำเร็จ');
    }
  }

  const data = query.data;

  return (
    <div className="space-y-6">
      {/* Hero (mockup: ชิปสถานะ → คำทักทายตัวใหญ่ → วันที่ + สรุป · ขวา: quick keys + ปุ่ม Standup) */}
      <Card hero className="p-5 md:p-8">
        <div className="flex flex-wrap items-center gap-2">
          {data ? (
            <span className="inline-flex h-7 items-center gap-2 rounded-chip border border-hairline bg-wash px-3 font-mono text-xs text-fg-secondary">
              <span aria-hidden="true" className="size-1.5 rounded-full bg-track-fill" />
              {zoneLabel(data.timezone)}
            </span>
          ) : null}
          <StatusPill
            status={online ? 'online' : 'offline'}
            label={online ? 'ระบบเชื่อมต่อสมบูรณ์' : 'ออฟไลน์'}
          />
        </div>
        <div className="mt-6 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0 space-y-2">
            {data ? (
              <>
                <h1 className="text-[32px] font-semibold leading-[1.15] md:text-[44px]">
                  {data.greeting}
                </h1>
                <p className="text-sm text-fg-secondary md:text-base">
                  {longDate(data.date)} · สรุปสถานะการทำงาน กิจวัตร และแผนวันนี้
                </p>
              </>
            ) : (
              <>
                <h1 className="sr-only">วันนี้</h1>
                <Skeleton className="h-11 w-72" />
                <Skeleton className="h-4 w-64" />
              </>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <p
              className="hidden h-10 items-center gap-2 rounded-chip border border-hairline px-4 text-xs text-fg-secondary xl:flex"
              lang="en"
            >
              <span className="font-mono uppercase tracking-wider">Quick keys</span>
              <Kbd>⌘K</Kbd> ค้นหา <Kbd>s</Kbd> standup
            </p>
            <Button shape="pill" size="lg" className="gap-2" onClick={() => setStandup(true)}>
              <Sparkles size={16} aria-hidden="true" /> สร้าง Standup
            </Button>
          </div>
        </div>
      </Card>

      {/* การ์ดของแต่ละโมดูล — ลำดับและจำนวนมาจาก API (registry) */}
      {query.isPending ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-12">
          {[7, 5].map((span) => (
            <Card key={span} className={SPAN[span as 5 | 7]}>
              <div className="space-y-3 p-6">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-8 w-48" />
                <Skeleton className="h-14 w-full rounded-row" />
                <Skeleton className="h-14 w-full rounded-row" />
              </div>
            </Card>
          ))}
        </div>
      ) : !data ? (
        <Card>
          <ErrorState message="โหลดสรุปวันนี้ไม่สำเร็จ" onRetry={() => void query.refetch()} />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-12">
          {data.widgets.map((w, i) => (
            <WidgetCard
              key={w.module}
              widget={w}
              className={cn(
                SPAN[desktopSpan(i, data.widgets.length)],
                i === data.widgets.length - 1 && data.widgets.length % 2 === 1 && 'md:col-span-2',
              )}
            />
          ))}
          {data.failedModules.map((m) => (
            <Card key={m} className="lg:col-span-12">
              <CardContent className="pt-5 md:pt-6">
                <p role="alert" className="text-sm text-fg-secondary">
                  การ์ดของโมดูล “{m}” โหลดไม่สำเร็จ — ส่วนอื่นของหน้ายังใช้ได้ตามปกติ
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Developer Quick Actions — การ์ดเดียว หัวข้อ + สถานะ และ 3 ช่องข้างใน (mockup) */}
      <Card>
        <CardHeader
          title={
            <span id="quick-actions" className="text-lg">
              คำสั่งด่วนและทางลัด{' '}
              <span className="text-fg-secondary">(Developer Quick Actions)</span>
            </span>
          }
          description="เครื่องมือช่วยงานแบบ Local-First และการสรุป Standup"
          aside={
            <span className="hidden items-center gap-2 font-mono text-xs text-fg-secondary sm:inline-flex">
              <span aria-hidden="true" className="size-1.5 rounded-full bg-track-fill" />
              {online ? 'Online · Outbox 0' : 'Offline'}
            </span>
          }
        />
        <CardContent>
          <div role="group" aria-labelledby="quick-actions" className="grid gap-3 md:grid-cols-3">
            <QuickAction
              icon={<Copy size={18} />}
              title="คัดลอก Standup Markdown"
              description="จัดกลุ่ม Done, Doing, Blocked"
              onClick={copyStandup}
            />
            <QuickAction
              icon={<RefreshCw size={18} />}
              title="Materialize Recurrence"
              description="ใช้ได้ใน Phase 3 (Recurrence Engine)"
              disabled
            />
            <QuickAction
              icon={<Inbox size={18} />}
              title="Offline Outbox Status"
              description={online ? '0 pending muts · Synced' : 'ออฟไลน์ — รอส่งใน Phase 7'}
              disabled
            />
          </div>
        </CardContent>
      </Card>

      <StandupSheet open={standupOpen} onClose={() => setStandup(false)} />
    </div>
  );
}

function QuickAction({
  icon,
  title,
  description,
  onClick,
  disabled = false,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-3 rounded-row bg-sunken p-4 text-left transition-colors hover:bg-wash-active focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] disabled:cursor-not-allowed disabled:hover:bg-sunken"
    >
      <span
        aria-hidden="true"
        className="flex size-10 shrink-0 items-center justify-center rounded-control bg-surface text-fg"
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-xs text-fg-secondary">{description}</span>
      </span>
    </button>
  );
}
