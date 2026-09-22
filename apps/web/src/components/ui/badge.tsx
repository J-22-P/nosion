import { cn } from '@nosion/ui';
import type * as React from 'react';

export function Badge({
  className,
  color,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { color?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border border-[var(--border)] px-2 py-0.5 text-xs font-medium',
        className,
      )}
      style={color ? { borderColor: color, color } : undefined}
      {...props}
    />
  );
}
