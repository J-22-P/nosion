'use client';

import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { SHORTCUTS } from '@/lib/shortcuts/keymap';
import { useUIStore } from '@/lib/stores/ui-store';

/** หน้าต่าง "?" — ปุ่มลัดทั้งหมด (สเปก 8.4) อ่านจากตารางเดียวกับที่ใช้จับปุ่มจริง */
export function ShortcutsDialog() {
  const open = useUIStore((s) => s.shortcutsOpen);
  const setOpen = useUIStore((s) => s.setShortcutsOpen);
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const groups = [...new Set(SHORTCUTS.map((s) => s.group))];

  return (
    <dialog
      ref={ref}
      onClose={() => {
        if (!ref.current?.open) setOpen(false); // ดู CommandPalette — event close มาแบบ async
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
      aria-labelledby="shortcuts-title"
      className="m-auto max-h-[calc(100dvh-32px)] w-[min(560px,calc(100vw-32px))] overflow-y-auto rounded-panel border border-hairline bg-surface p-0 text-fg shadow-float backdrop:bg-black/40"
    >
      <div className="sticky top-0 flex items-center justify-between gap-3 border-b border-hairline bg-surface px-5 py-4">
        <h2 id="shortcuts-title" className="text-base font-semibold">
          ปุ่มลัด
        </h2>
        <Button variant="ghost" size="icon-sm" onClick={() => setOpen(false)} aria-label="ปิด">
          <X size={16} aria-hidden="true" />
        </Button>
      </div>
      <div className="space-y-5 p-5">
        {groups.map((group) => (
          <section key={group} aria-labelledby={`sc-${group}`}>
            <h3 id={`sc-${group}`} className="mb-2 text-xs font-medium text-fg-secondary">
              {group}
            </h3>
            <dl className="divide-y divide-hairline">
              {SHORTCUTS.filter((s) => s.group === group).map((s) => (
                <div key={s.label} className="flex items-center justify-between gap-4 py-2 text-sm">
                  <dt>{s.label}</dt>
                  <dd className="flex shrink-0 items-center gap-1">
                    {s.keys.map((k, i) =>
                      k === '–' ? (
                        <span key={i} className="text-fg-secondary">
                          –
                        </span>
                      ) : (
                        <Kbd key={i}>{k}</Kbd>
                      ),
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </dialog>
  );
}
