'use client';

import { cn } from '@nosion/ui';
import * as React from 'react';

export interface MenuItem {
  label: string;
  icon?: React.ReactNode;
  onSelect: () => void;
  tone?: 'default' | 'danger';
}

/**
 * เมนู ⋯ แบบเบา (level 3 float) — ARIA menu button pattern
 * เปิดแล้ว focus รายการแรก · ↑↓ เลื่อน · Esc / คลิกนอกกล่องปิดแล้วคืน focus ให้ปุ่ม
 */
export function Menu({
  label,
  trigger,
  items,
  align = 'end',
}: {
  /** ชื่อปุ่มให้ screen reader เช่น "ตัวเลือกของงาน X" */
  label: string;
  trigger: React.ReactNode;
  items: readonly MenuItem[];
  align?: 'start' | 'end';
}) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const itemRefs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const menuId = React.useId();

  const close = React.useCallback((restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) buttonRef.current?.focus();
  }, []);

  React.useEffect(() => {
    if (!open) return;
    itemRefs.current[0]?.focus();
    function onPointer(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) close(false);
    }
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [open, close]);

  function onMenuKey(event: React.KeyboardEvent) {
    const current = itemRefs.current.findIndex((el) => el === document.activeElement);
    const last = items.length - 1;
    let next: number | null = null;
    if (event.key === 'ArrowDown') next = current >= last ? 0 : current + 1;
    else if (event.key === 'ArrowUp') next = current <= 0 ? last : current - 1;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = last;
    else if (event.key === 'Escape' || event.key === 'Tab') {
      if (event.key === 'Escape') event.preventDefault();
      close(event.key === 'Escape');
      return;
    }
    if (next === null) return;
    event.preventDefault();
    itemRefs.current[next]?.focus();
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((v) => !v)}
        className="flex size-8 items-center justify-center rounded-full text-fg-secondary transition-colors hover:bg-wash hover:text-fg focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
      >
        {trigger}
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKey}
          className={cn(
            'absolute top-[calc(100%+6px)] z-30 min-w-48 rounded-[14px] border border-hairline bg-elevated p-1 shadow-float backdrop-blur-xl',
            align === 'end' ? 'right-0' : 'left-0',
          )}
        >
          {items.map((item, index) => (
            <button
              key={item.label}
              ref={(el) => {
                itemRefs.current[index] = el;
              }}
              type="button"
              role="menuitem"
              tabIndex={-1}
              onClick={() => {
                close(true);
                item.onSelect();
              }}
              className={cn(
                'flex h-9 w-full items-center gap-2 rounded-control px-2.5 text-left text-sm outline-none [&_svg]:size-4',
                item.tone === 'danger'
                  ? 'text-danger hover:bg-danger-soft focus:bg-danger-soft'
                  : 'text-fg hover:bg-wash focus:bg-wash',
              )}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
