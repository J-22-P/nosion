'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useUIStore } from '@/lib/stores/ui-store';
import { createKeyReader, isTypingTarget, type GlobalAction } from './keymap';
import { useUndoStore } from './undo-store';
import { errorText } from '@/i18n/errors';
import { tr } from '@/i18n/current';

/** element ที่มองเห็นอยู่ตัวแรก — ช่องเดียวกันมักมีสองชุด (มือถือ/desktop) ที่ซ่อนตาม breakpoint */
function firstVisible(selector: string): HTMLElement | null {
  return (
    [...document.querySelectorAll<HTMLElement>(selector)].find((el) => el.offsetParent !== null) ??
    null
  );
}

/** j / k: ย้ายโฟกัสระหว่าง `[data-shortcut-item]` ตามลำดับในหน้า · ยังไม่มีตัวไหนโฟกัส = ตัวแรก */
function moveItemFocus(direction: 1 | -1) {
  const items = [...document.querySelectorAll<HTMLElement>('[data-shortcut-item]')].filter(
    (el) => el.offsetParent !== null,
  );
  if (items.length === 0) return;
  const current = items.findIndex((el) => el.contains(document.activeElement));
  const next = current === -1 ? 0 : Math.min(Math.max(current + direction, 0), items.length - 1);
  items[next]!.focus();
  items[next]!.scrollIntoView({ block: 'nearest' });
}

/**
 * ปุ่มลัดระดับแอป (สเปก 8.4) — ติดตั้งครั้งเดียวที่ AppShell
 * หน้าไม่ต้องลงทะเบียนอะไร: "n" หา `[data-shortcut="new"]` · "/" หา `[data-shortcut="search"]` · ไม่มี = เปิด palette
 * มี dialog เปิดอยู่ (palette, ฟอร์ม) = ปิดปุ่มลัดทั้งหมด ยกเว้น ⌘K
 */
export function useGlobalShortcuts() {
  const router = useRouter();
  const reader = useRef(createKeyReader());

  useEffect(() => {
    function run(action: GlobalAction) {
      const ui = useUIStore.getState();
      switch (action.kind) {
        case 'palette':
          ui.setPaletteOpen(!ui.paletteOpen);
          break;
        case 'new':
        case 'search': {
          const target = firstVisible(`[data-shortcut="${action.kind}"]`);
          if (target) target.focus();
          else ui.setPaletteOpen(true);
          break;
        }
        case 'help':
          ui.setShortcutsOpen(true);
          break;
        case 'sidebar':
          ui.toggleSidebar();
          break;
        case 'go':
          router.push(action.href);
          break;
        case 'next':
          moveItemFocus(1);
          break;
        case 'prev':
          moveItemFocus(-1);
          break;
        case 'undo': {
          const item = useUndoStore.getState().pop();
          if (!item) {
            toast(tr('undo.nothing'));
            break;
          }
          item
            .run()
            .then(() => toast.success(tr('undo.done', { label: item.label })))
            .catch((error: unknown) =>
              toast.error(tr('undo.failed'), {
                description: errorText(error),
              }),
            );
          break;
        }
      }
    }

    function onKey(event: KeyboardEvent) {
      if (event.defaultPrevented || event.isComposing) return;
      const action = reader.current(event, Date.now());
      if (!action) return;
      // ⌘K ใช้ได้เสมอ (แม้กำลังพิมพ์) · อย่างอื่นไม่แย่งปุ่มจากช่องพิมพ์ — ⌘Z ในช่องพิมพ์คือ undo ของข้อความ
      if (action.kind !== 'palette') {
        if (isTypingTarget(event.target)) return;
        if (document.querySelector('dialog[open]')) return;
      }
      event.preventDefault();
      run(action);
    }

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [router]);
}
