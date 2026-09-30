'use client';

import { Check } from 'lucide-react';
import { cn } from '@nosion/ui';
import * as React from 'react';

/**
 * Checkbox (สเปก 8.7.5) · วงกลมสำหรับ task / มน 5px สำหรับ habit
 * ใช้ <button role="checkbox"> เพื่อให้ขนาด/รูปทรงตรง mockup แต่ยังอ่านได้ด้วย screen reader
 */
export interface CheckboxProps extends Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  'onChange'
> {
  checked: boolean;
  onCheckedChange?: (checked: boolean) => void;
  shape?: 'circle' | 'square';
  size?: 'sm' | 'md';
}

export const Checkbox = React.forwardRef<HTMLButtonElement, CheckboxProps>(
  (
    { checked, onCheckedChange, shape = 'circle', size = 'md', className, onClick, ...props },
    ref,
  ) => (
    <button
      ref={ref}
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) onCheckedChange?.(!checked);
      }}
      className={cn(
        'relative flex shrink-0 items-center justify-center border-[1.5px] transition-colors duration-[120ms] ease-standard',
        // พื้นที่กดขั้นต่ำ 24px แม้ตัว checkbox จะเล็กกว่า
        'before:absolute before:-inset-1 before:content-[""]',
        'focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]',
        'disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' ? 'size-[18px]' : 'size-5',
        shape === 'circle' ? 'rounded-full' : 'rounded-[5px]',
        checked
          ? 'border-primary bg-primary text-primary-fg'
          : 'border-hairline-strong bg-transparent hover:border-fg-secondary',
        className,
      )}
      {...props}
    >
      {checked ? <Check size={size === 'sm' ? 11 : 12} strokeWidth={3} aria-hidden="true" /> : null}
    </button>
  ),
);
Checkbox.displayName = 'Checkbox';
