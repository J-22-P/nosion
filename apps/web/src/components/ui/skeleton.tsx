import { cn } from '@nosion/ui';
import type * as React from 'react';

/**
 * skeleton ต้องมีรูปร่างเหมือนของจริง ไม่ใช่ spinner กลางจอ (สเปก 8.7.5)
 * บล็อก surface-sunken กระพริบ opacity — ปิดเองเมื่อ prefers-reduced-motion (globals.css)
 */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('animate-pulse rounded-md bg-sunken', className)} {...props} />;
}

export function TaskListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <ul className="space-y-2" aria-hidden="true">
      {Array.from({ length: rows }).map((_, index) => (
        <li key={index} className="flex items-center gap-3 rounded-row bg-sunken/60 p-4">
          <Skeleton className="size-5 rounded-full bg-wash-active" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/2 bg-wash-active" />
            <Skeleton className="h-3 w-1/4 bg-wash-active" />
          </div>
          <Skeleton className="h-6 w-16 rounded-chip bg-wash-active" />
        </li>
      ))}
    </ul>
  );
}
