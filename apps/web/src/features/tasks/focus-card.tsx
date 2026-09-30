'use client';

import { Square, Timer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { formatClock, formatDuration } from '@/lib/format';
import { useElapsedSeconds, useFocusToday, useStopTimer } from './use-task-queries';

/**
 * การ์ด "Focus Session วันนี้" (สเปก 8.11.2) — desktop อยู่ใต้ sidebar, มือถืออยู่บนสุด
 * ตัวเลขจาก GET /tasks/focus/today แล้วนับวินาทีต่อเองฝั่ง client ระหว่างมีรอบที่กำลังจับ
 */
export function FocusCard({ className }: { className?: string }) {
  const query = useFocusToday();
  const stop = useStopTimer();
  const data = query.data;
  const running = data?.running ?? null;

  // เวลาที่ผ่านไปตั้งแต่ server ตอบ → บวกเข้ายอดรวม ให้ตัวเลขเดินโดยไม่ต้องยิง API ทุกวินาที
  const sinceFetch = useElapsedSeconds(
    running && query.dataUpdatedAt ? new Date(query.dataUpdatedAt).toISOString() : null,
  );
  const runningFor = useElapsedSeconds(running?.startedAt);

  if (query.isPending) {
    return (
      <Card className={className}>
        <div className="space-y-3 p-5">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-1.5 w-full" />
        </div>
      </Card>
    );
  }
  if (!data) return null; // error → ซ่อนการ์ดเสริมไปเงียบ ๆ ไม่แย่งพื้นที่รายการงาน

  const total = data.totalSeconds + (running ? sinceFetch : 0);
  const goalSeconds = data.goalMinutes * 60;

  return (
    <Card className={className}>
      <CardHeader
        icon={<Timer />}
        title="Focus วันนี้"
        description={`${data.completedSessions} รอบที่จบแล้ว`}
      />
      <CardContent className="space-y-3">
        <p className="flex items-baseline gap-2">
          <span className="nums text-[32px] font-semibold leading-none tracking-display" lang="en">
            {formatDuration(total)}
          </span>
          <span className="text-sm text-fg-secondary">/ {data.goalMinutes / 60} ชม.</span>
        </p>
        <Progress value={total} max={goalSeconds} label="เวลาโฟกัสเทียบกับเป้าหมายวันนี้" />

        {running ? (
          <div className="flex items-center gap-3 rounded-row bg-sunken p-3">
            <span
              aria-hidden="true"
              className="size-2 shrink-0 animate-pulse rounded-full bg-accent"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium">{running.entryTitle}</p>
              <p className="nums font-mono text-xs text-fg-secondary" aria-live="off">
                {formatClock(runningFor)}
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => stop.stop(running.entryId)}
              disabled={stop.isPending}
              aria-label={`หยุดจับเวลา ${running.entryTitle}`}
            >
              <Square size={12} fill="currentColor" aria-hidden="true" /> หยุด
            </Button>
          </div>
        ) : (
          <p className="text-xs text-fg-secondary">
            กด “เริ่มจับเวลา” ที่การ์ดงานเพื่อเริ่มรอบใหม่
          </p>
        )}
      </CardContent>
    </Card>
  );
}
