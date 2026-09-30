import { AlertTriangle, Inbox } from 'lucide-react';
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
        className="flex size-12 items-center justify-center rounded-card bg-sunken text-fg-secondary"
      >
        <Inbox size={22} strokeWidth={1.75} />
      </div>
      <div>
        <p className="font-medium">{title}</p>
        {description ? <p className="mt-1 text-sm text-fg-secondary">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <div
        aria-hidden="true"
        className="flex size-12 items-center justify-center rounded-card bg-danger-soft text-danger"
      >
        <AlertTriangle size={22} strokeWidth={1.75} />
      </div>
      <p className="font-medium">โหลดข้อมูลไม่สำเร็จ</p>
      <p className="max-w-md text-sm text-fg-secondary">{message}</p>
      {onRetry ? (
        <Button variant="secondary" size="sm" onClick={onRetry}>
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
      className="mb-3 flex items-center justify-between gap-3 rounded-[14px] bg-warning-soft px-4 py-2.5 text-xs text-fg"
    >
      <span>กำลังแสดงข้อมูลที่แคชไว้ — เชื่อมต่อเซิร์ฟเวอร์ไม่ได้</span>
      {onRetry ? (
        <button type="button" onClick={onRetry} className="font-medium text-accent hover:underline">
          ลองใหม่
        </button>
      ) : null}
    </div>
  );
}
