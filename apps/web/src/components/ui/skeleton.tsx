import { cn } from '@nosion/ui';
import type * as React from 'react';

/** skeleton ต้องมีรูปร่างเหมือนของจริง ไม่ใช่ spinner กลางจอ (สเปกหัวข้อ 8.7) */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('animate-pulse rounded-md bg-[var(--muted)]', className)} {...props} />;
}

export function TaskListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <ul className="divide-y divide-[var(--border)]" aria-hidden="true">
      {Array.from({ length: rows }).map((_, index) => (
        <li key={index} className="flex items-center gap-3 px-4 py-3">
          <Skeleton className="h-4 w-4 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-3 w-1/4" />
          </div>
          <Skeleton className="h-5 w-16 rounded-full" />
        </li>
      ))}
    </ul>
  );
}
