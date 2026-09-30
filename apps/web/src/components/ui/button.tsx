import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@nosion/ui';
import * as React from 'react';

/**
 * ปุ่ม (สเปก 8.7.5)
 * - primary   พื้น --primary (obsidian ใน light / ขาวทึบใน dark) · "สร้างงาน ↵"
 * - secondary พื้น hover-wash + hairline · "+1 วัน", "เริ่มจับเวลา"
 * - ghost     ไม่มีพื้น · ปุ่ม ⋯, filter, ⚙
 * - danger    ใช้เฉพาะการกระทำที่ย้อนกลับไม่ได้
 */
const buttonVariants = cva(
  [
    'inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap font-medium',
    'transition-[background-color,color,transform,opacity] duration-[180ms] ease-standard',
    'active:scale-[.98] disabled:pointer-events-none disabled:opacity-40',
    'focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]',
    '[&_svg]:shrink-0',
  ],
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-fg hover:scale-[1.01] hover:opacity-90',
        secondary: 'border border-hairline bg-wash text-fg hover:bg-wash-active',
        ghost: 'bg-transparent text-fg-secondary hover:bg-wash hover:text-fg',
        danger: 'bg-danger text-white hover:opacity-90',
      },
      size: {
        sm: 'h-8 px-3 text-[13px]',
        md: 'h-10 px-[18px] text-sm',
        lg: 'h-12 px-6 text-[15px]',
        icon: 'size-9',
        'icon-sm': 'size-8',
      },
      shape: {
        control: 'rounded-control',
        pill: 'rounded-chip',
        circle: 'rounded-full',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md', shape: 'control' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, shape, type = 'button', ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(buttonVariants({ variant, size, shape }), className)}
      {...props}
    />
  ),
);
Button.displayName = 'Button';

export { buttonVariants };
