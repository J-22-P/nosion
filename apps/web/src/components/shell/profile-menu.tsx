'use client';

import { LogOut, Settings } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import { cn } from '@nosion/ui';
import { ThemeSwitcher } from '@/components/shared/theme-switcher';
import { Badge } from '@/components/ui/badge';
import { authApi } from '@/features/auth/api';
import { useAuthStore } from '@/features/auth/auth-store';
import { useTranslations } from 'next-intl';

export function useLogout() {
  const router = useRouter();
  const clear = useAuthStore((s) => s.clear);
  return async () => {
    await authApi.logout().catch(() => undefined);
    clear();
    router.replace('/login');
  };
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-[13px] font-semibold text-primary-fg',
        className,
      )}
    >
      {name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  );
}

/**
 * เมนูโปรไฟล์บน top bar — ชื่อ + ป้ายบัญชีทดลอง, ธีม, ตั้งค่า, ออกจากระบบ
 * ปิดด้วย Esc / คลิกนอกกล่อง แล้วคืน focus ให้ปุ่มเปิด
 */
export function ProfileMenu({ displayName, isDemo }: { displayName: string; isDemo: boolean }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const logout = useLogout();
  const t = useTranslations('shell');

  useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={t('accountOf', { name: displayName })}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-chip py-1 pl-1 pr-1 transition-colors hover:bg-wash focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] lg:pr-3"
      >
        <Avatar name={displayName} />
        <span className="hidden max-w-32 truncate text-[13px] font-medium lg:inline">
          {displayName}
        </span>
      </button>

      {open ? (
        <div
          id={panelId}
          className="absolute right-0 top-[calc(100%+8px)] z-30 w-64 rounded-card border border-hairline bg-elevated p-2 shadow-float backdrop-blur-xl"
        >
          <div className="flex items-center gap-3 px-2 py-2">
            <Avatar name={displayName} />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{displayName}</p>
              {isDemo ? (
                <Badge tone="accent" className="mt-1">
                  {t('demoAccount')}
                </Badge>
              ) : null}
            </div>
          </div>
          <div className="my-2 flex items-center justify-between gap-2 px-2">
            <span className="text-[13px] text-fg-secondary">{t('theme')}</span>
            <ThemeSwitcher compact />
          </div>
          <div className="border-t border-hairline pt-1">
            <Link
              href="/settings"
              onClick={() => setOpen(false)}
              className="flex h-9 items-center gap-2 rounded-control px-2 text-sm hover:bg-wash"
            >
              <Settings size={16} aria-hidden="true" /> {t('settings')}
            </Link>
            <button
              type="button"
              onClick={() => void logout()}
              className="flex h-9 w-full items-center gap-2 rounded-control px-2 text-sm text-danger hover:bg-danger-soft"
            >
              <LogOut size={16} aria-hidden="true" /> {t('logout')}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
