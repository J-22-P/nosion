import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@nosion/ui';
import * as React from 'react';

/**
 * Badge = ป้ายแสดงผลอย่างเดียว · pill สูง 24px (สเปก 8.7.5)
 * priority: URGENT → danger · HIGH → neutral · MEDIUM → outline
 * metadata (branch, PR #, เวลา) ใช้ mono
 */
const badgeVariants = cva(
  'inline-flex h-6 shrink-0 items-center gap-1 whitespace-nowrap rounded-chip px-2.5 text-xs font-medium [&_svg]:size-3',
  {
    variants: {
      tone: {
        neutral: 'bg-wash-active text-fg',
        outline: 'border border-hairline-strong text-fg-secondary',
        accent: 'bg-accent-soft text-accent',
        danger: 'bg-danger-soft text-danger',
        warning: 'bg-warning-soft text-warning',
        success: 'bg-success-soft text-success',
      },
      mono: { true: 'font-mono text-[11px] font-normal', false: '' },
    },
    defaultVariants: { tone: 'neutral', mono: false },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, mono, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone, mono }), className)} {...props} />;
}

/**
 * Chip = pill ที่กดได้ (ตัวกรอง, แท็ก, smart list) · aria-pressed บอกสถานะเลือก
 */
export const Chip = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean }
>(({ className, selected = false, type = 'button', ...props }, ref) => (
  <button
    ref={ref}
    type={type}
    aria-pressed={selected}
    className={cn(
      'inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-chip border px-3 text-[13px] font-medium',
      'transition-colors duration-[180ms] ease-standard focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]',
      selected
        ? 'border-transparent bg-primary text-primary-fg'
        : 'border-hairline bg-transparent text-fg-secondary hover:bg-wash hover:text-fg',
      className,
    )}
    {...props}
  />
));
Chip.displayName = 'Chip';

export { badgeVariants };
