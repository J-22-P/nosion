'use client';

import { cn } from '@nosion/ui';
import { RefreshCw } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useConflictStore } from './conflict-dialog';
import { syncedAgo } from './connection';
import { syncNow, useConnection } from './use-sync';
import { useTranslations } from 'next-intl';

const DOT = {
  online: 'bg-success',
  offline: 'bg-danger',
  syncing: 'bg-accent animate-pulse',
} as const;

/**
 * Sync Status ใน sidebar (สเปก 8.6) — จุดสถานะ + เวอร์ชันแอป · คลิกเปิด popover:
 * ซิงก์ล่าสุดเมื่อไร · รอกี่รายการ · ปุ่ม "ซิงก์เดี๋ยวนี้" · ดูรายการที่แก้ชน (ถ้ามี)
 */
export function SyncStatus({ appVersion }: { appVersion: string }) {
  const c = useConnection();
  const conflicts = useConflictStore((s) => s.items.length);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const t = useTranslations('syncUi');

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const label = c.status === 'online' ? `Sync · v${appVersion}` : c.label;
  const ago = syncedAgo(c.lastSyncedAt);

  async function sync() {
    setBusy(true);
    try {
      await syncNow();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={t('statusOf', { label: c.label })}
        className={cn(
          'inline-flex h-7 items-center gap-2 rounded-chip border border-hairline bg-wash px-3 text-xs font-medium transition-colors hover:bg-wash-active focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]',
          c.status === 'offline'
            ? 'text-danger'
            : c.status === 'syncing'
              ? 'text-accent'
              : 'text-fg-secondary',
        )}
      >
        <span aria-hidden="true" className={cn('size-1.5 rounded-full', DOT[c.status])} />
        <span role="status" aria-live="polite">
          {label}
        </span>
      </button>

      {open ? (
        <div
          id={panelId}
          role="region"
          aria-label={t('statusRegion')}
          className="absolute bottom-full left-0 z-30 mb-2 w-64 space-y-3 rounded-panel border border-hairline bg-surface p-4 text-sm shadow-float"
        >
          <dl className="space-y-1.5 text-xs">
            <div className="flex justify-between gap-3">
              <dt className="text-fg-secondary">{t('status')}</dt>
              <dd>{c.online ? (c.pending ? c.label : t('connected')) : t('offline')}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-fg-secondary">{t('waiting')}</dt>
              <dd className="font-mono">{t('waitingCount', { count: c.pending })}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-fg-secondary">{t('lastSync')}</dt>
              <dd>{ago ?? '—'}</dd>
            </div>
            {c.lastError ? <p className="text-danger">{c.lastError}</p> : null}
          </dl>
          <Button
            size="sm"
            className="w-full gap-2"
            onClick={() => void sync()}
            disabled={!c.online || busy}
          >
            <RefreshCw size={14} aria-hidden="true" className={cn(busy && 'animate-spin')} />
            {t('syncNow')}
          </Button>
          {conflicts ? (
            <Button
              size="sm"
              variant="ghost"
              className="w-full"
              onClick={() => {
                setOpen(false);
                useConflictStore.getState().show();
              }}
            >
              {t('viewConflicts', { count: conflicts })}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
