'use client';

import type { EntryDto, ParsedEntryDto } from '@nosion/contracts';
import { formatMoney } from '@nosion/core/money';
import { parseNaturalText } from '@nosion/core/nl';
import { cn, MODULE_THEME } from '@nosion/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, CornerDownLeft, Search, Sparkles } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';
import { useLogout } from '@/components/shell/profile-menu';
import { Kbd } from '@/components/ui/kbd';
import { useSession } from '@/features/auth/use-session';
import { entriesApi } from '@/features/entries/api';
import { QUEUED_NOTE } from '@/features/entries/use-entries';
import { ApiError } from '@/lib/api-client';
import { isQueued } from '@/lib/sync';
import { DEFAULT_TIME_ZONE } from '@/lib/format';
import { useUIStore } from '@/lib/stores/ui-store';
import { parseApi } from './api';
import {
  COMMANDS,
  createLabel,
  describeParsed,
  entryHref,
  filterCommands,
  highlightSegments,
  paletteMode,
  whenLabel,
  type PaletteCommand,
} from './palette-model';

/** debounce ก่อนเรียก /parse และ /entries?q= (สเปก 8.3: 250ms) */
const DEBOUNCE_MS = 250;

interface RunModifiers {
  /** ⇧↵ บันทึกแล้วเปิดหน้ารายละเอียด */
  shift: boolean;
  /** ⌘↵ / Ctrl↵ บันทึกแล้วเปิดกล่องใหม่ต่อ (batch entry) */
  meta: boolean;
}

interface PaletteItem {
  id: string;
  section: string;
  render: (active: boolean) => React.ReactNode;
  run: (mods: RunModifiers) => void;
}

/**
 * Command Palette ⌘K (สเปก 8.3 — feature เรือธง) · ใช้ <dialog> แบบเดียวกับ dialog อื่นในแอป
 * (focus trap / Esc / backdrop มาจากเบราว์เซอร์) · mockup ยังไม่มี — ประกอบจาก token + component ใน 8.7
 */
export function CommandPalette() {
  const open = useUIStore((s) => s.paletteOpen);
  const setOpen = useUIStore((s) => s.setPaletteOpen);
  const ref = React.useRef<HTMLDialogElement>(null);

  React.useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      // event "close" มาแบบ async — ถ้ากด ⌘K เปิดใหม่ก่อน event ของการปิดครั้งก่อนจะมาถึง ต้องไม่ปิดซ้ำ
      onClose={() => {
        if (!ref.current?.open) setOpen(false);
      }}
      onClick={(e) => {
        // คลิกนอกกล่อง (ที่ backdrop) = ปิด
        if (e.target === e.currentTarget) setOpen(false);
      }}
      aria-label="Command palette"
      className="mx-auto mb-auto mt-[10vh] w-[min(640px,calc(100vw-32px))] overflow-hidden rounded-panel border border-hairline bg-elevated p-0 text-fg shadow-float backdrop:bg-black/40"
    >
      {open ? <PaletteBody onClose={() => setOpen(false)} /> : null}
    </dialog>
  );
}

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

const newClientId = () => `cmdk-${crypto.randomUUID()}`;

function PaletteBody({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { setTheme } = useTheme();
  const logout = useLogout();
  const { settings } = useSession();
  const timeZone = settings?.timezone ?? DEFAULT_TIME_ZONE;

  const [input, setInput] = React.useState('');
  const [active, setActive] = React.useState(0);
  const [clientId, setClientId] = React.useState(newClientId);
  const listId = React.useId();
  const text = input.trim();
  const mode = paletteMode(input);
  const debounced = useDebounced(text, DEBOUNCE_MS);
  const searching =
    mode === 'create' && debounced.length > 0 && paletteMode(debounced) === 'create';

  // preview ทันทีจาก parser ฝั่ง client (โค้ดชุดเดียวกับ server) — highlight ส่วนที่เข้าใจระหว่างรอ /parse
  const local = React.useMemo(
    () =>
      mode === 'create'
        ? parseNaturalText(input, {
            now: new Date(),
            timeZone,
            weekStartsOn: settings?.weekStartsOn,
          })
        : null,
    [input, mode, timeZone, settings?.weekStartsOn],
  );

  const preview = useQuery({
    queryKey: ['parse', debounced],
    queryFn: () => parseApi.preview(debounced),
    enabled: searching,
    staleTime: 30_000,
    placeholderData: (previous) => previous,
  });
  const search = useQuery({
    queryKey: ['entries', 'search', debounced],
    queryFn: () =>
      entriesApi.list({ q: debounced.slice(0, 100), limit: 5, sort: 'updatedAt:desc' }),
    enabled: searching,
    staleTime: 30_000,
    placeholderData: (previous) => previous,
  });

  const commit = useMutation({
    mutationFn: ({
      module,
    }: {
      module?: ParsedEntryDto['module'];
      mods: RunModifiers;
      label: string;
    }) => parseApi.commit({ text, module, clientId }),
    onSuccess: (result, { mods, label }) => {
      const queued = isQueued(result);
      toast.success(`${label}แล้ว`, {
        description: queued ? `${result.entry.title} · ${QUEUED_NOTE}` : result.entry.title,
      });
      void queryClient.invalidateQueries({ queryKey: ['entries'] });
      setClientId(newClientId());
      if (mods.meta) {
        setInput(''); // batch entry: กล่องเดิม พิมพ์รายการถัดไปได้เลย
        return;
      }
      onClose();
      // รายการที่ยังรอซิงก์ไม่มีหน้าของตัวเองบน server
      if (mods.shift && !queued) router.push(entryHref(result.entry, timeZone));
    },
    onError: (error) =>
      toast.error('สร้างไม่สำเร็จ', {
        description: error instanceof ApiError ? error.message : undefined,
      }),
  });

  // preview ตรงกับข้อความล่าสุดหรือยัง — ยังไม่ตรง (เพิ่งพิมพ์) ให้ server เลือกโมดูลเองตอน commit
  const fresh = preview.data && debounced === text;

  function runCommand(command: PaletteCommand) {
    const action = command.action;
    if (action.kind === 'navigate') router.push(action.href);
    if (action.kind === 'theme') setTheme(action.theme);
    if (action.kind === 'logout') void logout();
    onClose();
  }

  const items: PaletteItem[] = [];
  const commandItem = (c: PaletteCommand, section: string): PaletteItem => ({
    id: c.id,
    section,
    run: () => runCommand(c),
    render: () => (
      <span className="flex items-center gap-3">
        <ArrowRight size={15} aria-hidden="true" className="text-fg-secondary" />
        {c.label}
      </span>
    ),
  });

  if (mode === 'idle') {
    for (const c of COMMANDS.filter((c) => c.action.kind === 'navigate'))
      items.push(commandItem(c, 'ไปที่'));
  } else if (mode === 'command') {
    for (const c of filterCommands(input)) items.push(commandItem(c, 'คำสั่ง'));
  } else {
    const best = preview.data?.best ?? null;
    if (best) {
      items.push({
        id: `create:${best.module}`,
        section: 'สร้าง',
        run: (mods) =>
          commit.mutate({
            module: fresh ? best.module : undefined,
            mods,
            label: createLabel(best),
          }),
        render: (isActive) => (
          <CreateRow parsed={best} timeZone={timeZone} primary active={isActive} />
        ),
      });
    }
    for (const alt of preview.data?.alternatives ?? []) {
      items.push({
        id: `create:${alt.module}`,
        section: 'หรือสร้างเป็น…',
        run: (mods) => commit.mutate({ module: alt.module, mods, label: createLabel(alt) }),
        render: (isActive) => <CreateRow parsed={alt} timeZone={timeZone} active={isActive} />,
      });
    }
    for (const entry of search.data?.data ?? []) {
      items.push({
        id: `entry:${entry.id}`,
        section: 'ผลการค้นหา',
        run: () => {
          onClose();
          router.push(entryHref(entry, timeZone));
        },
        render: () => <SearchRow entry={entry} timeZone={timeZone} />,
      });
    }
  }

  const activeIndex = Math.min(active, Math.max(items.length - 1, 0));
  const sections = [...new Set(items.map((i) => i.section))];

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return; // กำลังเลือกคำใน IME — ↵ ยังไม่ใช่การยืนยัน
    const count = items.length;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (count === 0) return;
      setActive((activeIndex + (event.key === 'ArrowDown' ? 1 : count - 1)) % count);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (commit.isPending) return;
      items[activeIndex]?.run({ shift: event.shiftKey, meta: event.metaKey || event.ctrlKey });
    } else if (event.key === 'Tab' && sections.length > 1) {
      // tab สลับหมวด (สเปก 8.3) — โฟกัสยังอยู่ที่ช่องพิมพ์
      event.preventDefault();
      const current = sections.indexOf(items[activeIndex]?.section ?? '');
      const next =
        sections[(current + (event.shiftKey ? sections.length - 1 : 1)) % sections.length];
      setActive(items.findIndex((i) => i.section === next));
    }
  }

  const optionId = (index: number) => `${listId}-opt-${index}`;
  const busy = (preview.isFetching || search.isFetching) && mode === 'create';

  return (
    <div>
      <div className="flex items-center gap-3 border-b border-hairline px-4">
        {mode === 'command' ? (
          <ArrowRight size={18} aria-hidden="true" className="text-fg-secondary" />
        ) : (
          <Search size={18} aria-hidden="true" className="text-fg-secondary" />
        )}
        <input
          data-autofocus
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-expanded={items.length > 0}
          aria-controls={listId}
          aria-activedescendant={items.length ? optionId(activeIndex) : undefined}
          aria-autocomplete="list"
          aria-label="ค้นหา สร้างรายการ หรือพิมพ์ > เพื่อสั่งการ"
          placeholder="พิมพ์ “กาแฟ 65” เพื่อสร้าง · ค้นหา · > คำสั่ง"
          autoComplete="off"
          spellCheck={false}
          // :focus-visible ใน globals.css อยู่นอก layer จึงชนะ outline-none ของ Tailwind — ช่องนี้คือช่องเดียวใน dialog
          // ที่โฟกัสอยู่ตลอดเวลา (มี caret) กรอบสีฟ้าซ้อนขอบ dialog จึงไม่ช่วยอะไร
          style={{ outline: 'none' }}
          className="h-14 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-fg-secondary"
        />
        {busy ? (
          <span role="status" className="text-xs text-fg-secondary">
            กำลังคิด…
          </span>
        ) : null}
      </div>

      {local && local.tokens.length > 0 ? (
        <p
          aria-label="ส่วนที่เข้าใจ"
          className="truncate border-b border-hairline px-4 py-2 font-mono text-xs text-fg-secondary"
        >
          {highlightSegments(input, local.tokens).map((seg, i) =>
            seg.kind ? (
              <mark key={i} className="rounded-[4px] bg-accent-soft px-0.5 text-accent">
                {seg.text}
              </mark>
            ) : (
              <span key={i}>{seg.text}</span>
            ),
          )}
        </p>
      ) : null}

      <div
        id={listId}
        role="listbox"
        aria-label="ผลลัพธ์"
        className="max-h-[min(60vh,440px)] overflow-y-auto p-2"
      >
        {items.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-fg-secondary">
            {mode === 'command'
              ? 'ไม่พบคำสั่งนี้'
              : busy || preview.isPending
                ? 'กำลังค้นหา…'
                : 'ไม่พบอะไรเลย — ลองพิมพ์ชื่อรายการ'}
          </p>
        ) : (
          sections.map((section) => (
            <div key={section} role="group" aria-label={section} className="mb-1">
              <p className="px-3 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-fg-secondary">
                {section}
              </p>
              {items.map((item, index) =>
                item.section === section ? (
                  <div
                    key={item.id}
                    id={optionId(index)}
                    role="option"
                    aria-selected={index === activeIndex}
                    onMouseMove={() => index !== activeIndex && setActive(index)}
                    onClick={(e) => item.run({ shift: e.shiftKey, meta: e.metaKey || e.ctrlKey })}
                    className={cn(
                      // group: ข้อความรองในแถวที่เลือกเปลี่ยนเป็นสีหลัก — สีรองบนพื้น wash-active ไม่ถึง 4.5:1
                      'group cursor-pointer rounded-row px-3 py-2.5 text-sm',
                      index === activeIndex ? 'bg-wash-active' : 'hover:bg-wash',
                    )}
                  >
                    {item.render(index === activeIndex)}
                  </div>
                ) : null,
              )}
            </div>
          ))
        )}
      </div>

      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-hairline px-4 py-2.5 text-[11px] text-fg-secondary">
        <span>
          <Kbd>↑</Kbd> <Kbd>↓</Kbd> เลื่อน
        </span>
        <span>
          <Kbd>↵</Kbd> เลือก
        </span>
        {mode === 'create' ? (
          <>
            <span>
              <Kbd>⇧↵</Kbd> บันทึกแล้วเปิด
            </span>
            <span>
              <Kbd>⌘↵</Kbd> บันทึกแล้วสร้างต่อ
            </span>
          </>
        ) : null}
        <span>
          <Kbd>tab</Kbd> สลับหมวด
        </span>
        <span className="ml-auto">
          <Kbd>esc</Kbd> ปิด
        </span>
      </p>
    </div>
  );
}

function CreateRow({
  parsed,
  timeZone,
  primary = false,
  active,
}: {
  parsed: ParsedEntryDto;
  timeZone: string;
  primary?: boolean;
  active: boolean;
}) {
  const theme = MODULE_THEME[parsed.module];
  return (
    <span className="flex items-start gap-3">
      {primary ? (
        <Sparkles size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-accent" />
      ) : (
        <span
          aria-hidden="true"
          className="mt-0.5 shrink-0 font-mono text-xs"
          style={{ color: theme.cssVar }}
        >
          {theme.prefix}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-3">
          <span className={primary ? 'font-medium' : undefined}>{createLabel(parsed)}</span>
          {primary ? (
            <span className="shrink-0 font-mono text-[11px] text-fg-secondary group-aria-selected:text-fg">
              ความมั่นใจ {Math.round(parsed.confidence * 100)}%
            </span>
          ) : null}
        </span>
        <span className="mt-0.5 block truncate text-xs text-fg-secondary group-aria-selected:text-fg">
          {describeParsed(parsed, timeZone)}
        </span>
        {primary && active ? (
          <span className="mt-1 flex items-center gap-1 text-[11px] text-fg-secondary group-aria-selected:text-fg">
            <CornerDownLeft size={11} aria-hidden="true" /> เพื่อบันทึก
          </span>
        ) : null}
      </span>
    </span>
  );
}

function SearchRow({ entry, timeZone }: { entry: EntryDto; timeZone: string }) {
  const theme = MODULE_THEME[entry.module];
  const { amountMinor, currency } = entry.payload as { amountMinor?: unknown; currency?: string };
  const when = whenLabel(entry.occurredAt, entry.isAllDay, timeZone);
  return (
    <span className="flex items-center gap-3">
      <span
        aria-hidden="true"
        className="w-5 shrink-0 font-mono text-xs"
        style={{ color: theme.cssVar }}
      >
        {theme.prefix}
      </span>
      <span
        className={cn(
          'min-w-0 flex-1 truncate',
          entry.status === 'done' && 'text-fg-secondary group-aria-selected:text-fg line-through',
        )}
      >
        {entry.title}
      </span>
      <span className="shrink-0 text-xs text-fg-secondary group-aria-selected:text-fg">
        {[
          typeof amountMinor === 'number'
            ? formatMoney(amountMinor, currency ?? 'THB', { decimals: false })
            : null,
          when,
        ]
          .filter(Boolean)
          .join(' · ')}
      </span>
    </span>
  );
}
