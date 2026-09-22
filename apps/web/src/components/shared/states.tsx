import { Button } from '@/components/ui/button';
import type * as React from 'react';

/**
 * ทุก list ต้องมีครบ 5 สถานะ (สเปกหัวข้อ 8.7) — สามตัวท้ายคือสิ่งที่คนมักลืม:
 * Loading / Success / Empty / Error / Partial-stale
 */
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <div
        aria-hidden="true"
        className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--muted)] text-xl"
      >
        ✳
      </div>
      <div>
        <p className="font-medium">{title}</p>
        {description ? (
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <p className="font-medium text-[var(--destructive)]">โหลดข้อมูลไม่สำเร็จ</p>
      <p className="max-w-md text-sm text-[var(--muted-foreground)]">{message}</p>
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry}>
          ลองใหม่
        </Button>
      ) : null}
    </div>
  );
}

/** มีข้อมูลเก่าจากแคช แต่ refetch ไม่สำเร็จ — แสดงของเก่าพร้อมบอกตามตรง */
export function StaleBanner({ onRetry }: { onRetry?: () => void }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center justify-between gap-3 border-b border-amber-300/60 bg-amber-50 px-4 py-2 text-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"
    >
      <span>กำลังแสดงข้อมูลที่แคชไว้ — เชื่อมต่อเซิร์ฟเวอร์ไม่ได้</span>
      {onRetry ? (
        <button type="button" onClick={onRetry} className="font-medium underline">
          ลองใหม่
        </button>
      ) : null}
    </div>
  );
}
