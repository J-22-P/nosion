'use client';

import type { SyncResult } from '@nosion/contracts';
import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { create } from 'zustand';
import { Button } from '@/components/ui/button';
import { fieldLabel } from './summarize';
import { useTranslations } from 'next-intl';

interface ConflictState {
  /** conflict ล่าสุด (ใหม่ก่อน · เก็บ 20) — อยู่ในหน่วยความจำเท่านั้น */
  items: SyncResult[];
  open: boolean;
  add: (results: SyncResult[]) => void;
  show: () => void;
  close: () => void;
}

export const useConflictStore = create<ConflictState>((set) => ({
  items: [],
  open: false,
  add: (results) => set((s) => ({ items: [...results, ...s.items].slice(0, 20) })),
  show: () => set({ open: true }),
  close: () => set({ open: false }),
}));

function display(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

/**
 * รายละเอียดการแก้ชนกัน (สเปก 7.4 · 8.6) — แก้ field เดียวกันคนละค่าระหว่างออฟไลน์ → server ชนะ
 * บอกให้ชัดว่า "ค่าที่คุณพิมพ์" หายไปเป็นอะไร ผู้ใช้จะได้แก้ซ้ำเองถ้าต้องการ (ไม่เงียบ)
 */
export function ConflictDialog() {
  const { items, open, close } = useConflictStore();
  const ref = useRef<HTMLDialogElement>(null);
  const t = useTranslations('syncUi');

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={close}
      aria-labelledby="conflict-title"
      className="m-auto w-[min(560px,calc(100vw-32px))] rounded-panel border border-hairline bg-surface p-0 text-fg shadow-float backdrop:bg-black/40"
    >
      <div className="flex items-center justify-between gap-3 border-b border-hairline px-5 py-4">
        <h2 id="conflict-title" className="text-base font-semibold">
          {t('conflictTitle')}
        </h2>
        <Button variant="ghost" size="icon-sm" onClick={close} aria-label={t('close')}>
          <X size={16} aria-hidden="true" />
        </Button>
      </div>
      <div className="max-h-[60vh] space-y-4 overflow-y-auto p-5 text-sm">
        <p className="text-fg-secondary">{t('conflictIntro')}</p>
        {items.map((item) => (
          <section key={item.opId} className="space-y-2">
            <h3 className="font-medium">{item.entry?.title ?? t('item')}</h3>
            <table className="w-full text-left text-xs">
              <thead className="text-fg-secondary">
                <tr>
                  <th scope="col" className="py-1 pr-3 font-medium">
                    {t('colField')}
                  </th>
                  <th scope="col" className="py-1 pr-3 font-medium">
                    {t('colYours')}
                  </th>
                  <th scope="col" className="py-1 font-medium">
                    {t('colUsed')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {(item.conflicts ?? []).map((c) => (
                  <tr key={c.field} className="border-t border-hairline">
                    <th scope="row" className="py-1.5 pr-3 font-normal">
                      {fieldLabel(c.field)}
                    </th>
                    <td className="py-1.5 pr-3 text-fg-secondary line-through">
                      {display(c.client)}
                    </td>
                    <td className="py-1.5">{display(c.server)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
      </div>
    </dialog>
  );
}
