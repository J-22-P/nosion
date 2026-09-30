import { cn } from '@nosion/ui';
import type * as React from 'react';

/** Kbd hint — mono 11px บน hover-wash radius 6px · `⌘K`, `N`, `?`, `↵` */
export function Kbd({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded-[6px] border border-hairline bg-wash px-1.5 font-mono text-[11px] font-medium leading-none text-fg-secondary',
        className,
      )}
      {...props}
    />
  );
}
