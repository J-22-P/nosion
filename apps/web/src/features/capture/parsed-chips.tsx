'use client';

import { cn } from '@nosion/ui';
import { X } from 'lucide-react';
import { useState } from 'react';
import { priorityLabel } from '@/lib/format';
import { PRIORITIES, type CaptureChip } from './nl-chips';
import { useTranslations } from 'next-intl';

/**
 * แถว chip "PARSED:" ใต้ช่องบันทึกด่วน — กด chip เพื่อแก้ (วันที่ / เวลา / ความสำคัญ / แท็ก / โปรเจกต์) · × เพื่อลบ
 * แก้แล้วส่งข้อความใหม่กลับผ่าน `onReplace` (ข้อความคือแหล่งความจริงเดียว — ดู nl-chips.ts)
 * `extra` = chip ที่ไม่ได้มาจากข้อความ เช่น หมวดที่ server เดา (หน้า Expenses)
 */
export function ParsedChips({
  chips,
  onReplace,
  isNew,
  extra,
}: {
  chips: CaptureChip[];
  onReplace: (chip: CaptureChip, raw: string) => void;
  isNew?: (chip: CaptureChip) => boolean;
  extra?: React.ReactNode;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const t = useTranslations('capture');
  if (chips.length === 0 && !extra) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 px-2 pb-1 pt-2" aria-live="polite">
      <span className="mr-1 inline-flex items-center gap-1.5 font-mono text-[11px] font-medium text-fg-secondary">
        <span aria-hidden="true" className="size-1.5 rounded-full bg-success" />
        PARSED:
      </span>
      {chips.map((chip) =>
        editing === chip.key && chip.editor ? (
          <ChipEditor
            key={chip.key}
            chip={chip}
            onDone={(raw) => {
              setEditing(null);
              if (raw !== null) onReplace(chip, raw);
            }}
          />
        ) : (
          <span
            key={chip.key}
            className={cn(
              'inline-flex h-6 items-center gap-1 rounded-chip pl-2 pr-1 text-xs font-medium',
              chip.tone === 'danger' ? 'bg-danger-soft text-danger' : 'bg-wash-active text-fg',
            )}
          >
            {chip.editor ? (
              <button
                type="button"
                onClick={() => setEditing(chip.key)}
                aria-label={t('edit', { label: chip.label })}
                className="rounded-[4px] hover:underline focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
              >
                {chip.label}
              </button>
            ) : (
              <span>{chip.label}</span>
            )}
            {isNew?.(chip) ? <span className="text-[10px] text-accent">{t('new')}</span> : null}
            <button
              type="button"
              onClick={() => onReplace(chip, '')}
              aria-label={t('remove', { raw: chip.raw })}
              className="ml-0.5 flex size-4 items-center justify-center rounded-full hover:bg-wash"
            >
              <X size={10} aria-hidden="true" />
            </button>
          </span>
        ),
      )}
      {extra}
    </div>
  );
}

/** ตัวแก้แทนที่ chip ชั่วคราว · Enter/เลือก = ยืนยัน · Esc/ออกโดยไม่เปลี่ยน = ยกเลิก (null) */
function ChipEditor({ chip, onDone }: { chip: CaptureChip; onDone: (raw: string | null) => void }) {
  const [value, setValue] = useState(chip.value);
  const t = useTranslations('capture');
  const field =
    'h-6 rounded-chip border border-hairline-strong bg-surface px-2 font-mono text-xs text-fg';
  const label = t('edit', { label: chip.label });
  const commit = (v: string) => onDone(v === chip.value ? null : v);
  const keys = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation(); // ไม่ให้ Esc ไปล้างทั้งช่องพิมพ์
      onDone(null);
    }
    if (e.key === 'Enter') {
      e.preventDefault(); // ไม่ submit ฟอร์ม
      commit(value);
    }
  };

  if (chip.editor === 'priority') {
    return (
      <select
        autoFocus
        aria-label={label}
        value={value}
        onChange={(e) => commit(e.target.value)}
        onBlur={() => onDone(null)}
        onKeyDown={keys}
        className={field}
      >
        {PRIORITIES.map((p) => (
          <option key={p} value={p}>
            !{priorityLabel(p)}
          </option>
        ))}
      </select>
    );
  }
  return (
    <input
      autoFocus
      aria-label={label}
      type={chip.editor === 'date' ? 'date' : chip.editor === 'time' ? 'time' : 'text'}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => commit(value)}
      onKeyDown={keys}
      className={cn(field, chip.editor === 'text' && 'w-28')}
    />
  );
}
