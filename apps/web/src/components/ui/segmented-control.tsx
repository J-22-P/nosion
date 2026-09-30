'use client';

import { cn } from '@nosion/ui';
import * as React from 'react';

export interface SegmentedOption<T extends string> {
  value: T;
  label: React.ReactNode;
  /** ข้อความให้ screen reader เมื่อ label เป็นไอคอนล้วน */
  ariaLabel?: string;
}

/**
 * Segmented control (สเปก 8.7.5) — ราง pill บน surface-sunken
 * segment ที่เลือก: dark = ขาวทึบตัวดำ / light = ขาว + เงาบาง
 *
 * ARIA เป็น radiogroup: Tab เข้ามาที่ตัวที่เลือก แล้วใช้ลูกศรซ้าย/ขวา/Home/End เลื่อน
 * (ยังไม่ใช้ framer-motion — ใช้ CSS transition 180ms ไปก่อนเพื่อไม่เพิ่ม bundle)
 */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  label,
  size = 'md',
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  options: readonly SegmentedOption<T>[];
  label: string;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const refs = React.useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(event: React.KeyboardEvent, index: number) {
    const last = options.length - 1;
    const next =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? index === last
          ? 0
          : index + 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? index === 0
            ? last
            : index - 1
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : null;
    if (next === null) return;
    event.preventDefault();
    const option = options[next];
    if (!option) return;
    onChange(option.value);
    refs.current[next]?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn('inline-flex rounded-chip bg-sunken p-[3px]', className)}
    >
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            ref={(el) => {
              refs.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={option.ariaLabel}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={cn(
              'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-chip font-medium',
              'transition-[background-color,color,box-shadow] duration-[180ms] ease-standard',
              'focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] [&_svg]:size-4',
              size === 'sm' ? 'h-7 px-3 text-xs' : 'h-8 px-4 text-[13px]',
              selected
                ? 'bg-surface text-fg shadow-[0_1px_3px_rgba(0,0,0,.08)] dark:bg-primary dark:text-primary-fg dark:shadow-none'
                : 'text-fg-secondary hover:text-fg',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
