'use client';

import type { ExpenseCategory, ExpenseParseDto } from '@nosion/contracts';
import { parseNaturalText } from '@nosion/core/nl';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Zap } from 'lucide-react';
import { useEffect, useId, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useSession } from '@/features/auth/use-session';
import { buildChips, rawFor, replaceSpan } from '@/features/capture/nl-chips';
import { ParsedChips } from '@/features/capture/parsed-chips';
import { todayIn } from '@/features/calendar/grid';
import { parseApi } from '@/features/command-palette/api';
import { queuedNote } from '@/features/entries/use-entries';
import { isQueued } from '@/lib/sync';
import { DEFAULT_TIME_ZONE } from '@/lib/format';
import { expensesApi } from './api';
import { CATEGORY } from './categories';
import { errorText } from '@/i18n/errors';
import { tr } from '@/i18n/current';

type Parsed = ExpenseParseDto['result'];

/** ชิ้นที่รายจ่ายแสดงเป็น chip — แท็ก/โปรเจกต์ใช้ได้เหมือนงาน */
const EXPENSE_CHIPS = ['amount', 'date', 'recurrence', 'tag', 'project'] as const;

const newClientId = () => `ec-${crypto.randomUUID()}`;

/**
 * บันทึกด่วน "กาแฟ 65" (สเปก 8.11.3) — chip จาก parser ฝั่ง client ทันที + หมวดที่ server เดา (POST /expenses/parse)
 * กด chip หมวดเพื่อเปลี่ยน · ↵ บันทึกผ่าน POST /parse/commit: "ค่าเน็ต 799 ทุกวันที่ 5" ได้กฎบิลรายเดือน + การเตือน
 * (ก่อน Phase 5 ขั้น 8 สร้างได้แค่รายการเดียว) · Esc ล้าง
 */
export function ExpenseCapture() {
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<{ text: string; result: Parsed } | null>(null);
  const [category, setCategory] = useState<ExpenseCategory | null>(null);
  const [checking, setChecking] = useState(false);
  const [clientId, setClientId] = useState(newClientId);
  const { settings } = useSession();
  const timeZone = settings?.timezone ?? DEFAULT_TIME_ZONE;
  const queryClient = useQueryClient();
  const hintId = useId();
  const trimmed = text.trim();

  const nl = useMemo(
    () =>
      parseNaturalText(text, { now: new Date(), timeZone, weekStartsOn: settings?.weekStartsOn }),
    [text, timeZone, settings?.weekStartsOn],
  );
  const chips = buildChips(nl, EXPENSE_CHIPS, todayIn(timeZone));

  // preview เฉพาะข้อความที่มีตัวเลข — ไม่มีตัวเลขไม่มีทางเป็นรายจ่าย ไม่ต้องยิง API
  useEffect(() => {
    if (!/\d/.test(trimmed)) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const { result } = await expensesApi.parse(trimmed);
        if (!cancelled) setPreview({ text: trimmed, result });
      } catch {
        if (!cancelled) setPreview(null); // preview พังไม่เป็นไร — ตอนกด ↵ จะ parse ใหม่
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [trimmed]);

  const create = useMutation({
    mutationFn: () =>
      parseApi.commit({
        text: trimmed,
        module: 'expense',
        clientId,
        ...(category ? { payloadPatch: { category } } : {}),
      }),
    onSuccess: (result) => {
      const { entry, rule } = result;
      toast.success(rule ? tr('capture.billSet') : tr('capture.saved'), {
        description: isQueued(result) ? `${entry.title} · ${queuedNote()}` : entry.title,
      });
      void queryClient.invalidateQueries({ queryKey: ['entries'] });
      setText('');
      setPreview(null);
      setCategory(null);
      setClientId(newClientId());
    },
    onError: (error) =>
      toast.error(tr('capture.saveFailed'), {
        description: errorText(error),
      }),
  });

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!trimmed || create.isPending || checking) return;
    let result: Parsed = preview?.text === trimmed ? preview.result : null;
    if (preview?.text !== trimmed) {
      setChecking(true);
      try {
        result = (await expensesApi.parse(trimmed)).result;
      } catch (error) {
        toast.error(tr('capture.parseFailed'), {
          description: errorText(error),
        });
        return;
      } finally {
        setChecking(false);
      }
    }
    if (!result) {
      toast.error(tr('capture.noAmount'), { description: tr('capture.noAmountHint') });
      return;
    }
    create.mutate();
  }

  const shown = preview?.text === trimmed ? preview.result : null;
  const shownCategory = category ?? shown?.payload.category ?? null;

  return (
    <form
      onSubmit={submit}
      className="rounded-card border border-hairline bg-surface p-3 shadow-card md:p-4"
    >
      <div className="flex items-center gap-3">
        {/* ไอคอน ⚡ ในกล่อง + ช่องพิมพ์บนพื้น sunken + ปุ่มหลัก (mockup nosion_expenses_budget) */}
        <span
          aria-hidden="true"
          className="hidden size-11 shrink-0 items-center justify-center rounded-control bg-sunken text-fg sm:flex"
        >
          <Zap size={18} />
        </span>
        <div className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-control bg-sunken px-4 transition-shadow focus-within:shadow-[var(--focus-ring)]">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setText('');
                setCategory(null);
              }
            }}
            placeholder={tr('capture.expensePlaceholder')}
            aria-label={tr('capture.expenseLabel')}
            data-shortcut="new"
            aria-describedby={hintId}
            maxLength={200}
            className="h-full min-w-0 flex-1 bg-transparent text-[15px] text-fg outline-none placeholder:text-fg-tertiary"
          />
          <span
            aria-hidden="true"
            className="hidden shrink-0 items-center gap-1 rounded-[6px] border border-hairline px-2 py-0.5 font-mono text-[11px] text-fg-secondary md:inline-flex"
            lang="en"
          >
            Auto-Detect ↵
          </span>
        </div>
        <Button
          type="submit"
          shape="pill"
          disabled={!trimmed || create.isPending || checking}
          className="h-11 shrink-0 gap-2"
        >
          <Plus size={16} aria-hidden="true" />
          <span className="hidden sm:inline">{tr('capture.recordExpense')}</span>
          <span className="sm:hidden">{tr('capture.record')}</span>
        </Button>
      </div>
      <div id={hintId}>
        <ParsedChips
          chips={chips}
          onReplace={(chip, raw) =>
            setText((t) => replaceSpan(t, chip.start, chip.end, rawFor(chip.kind, raw)))
          }
          extra={
            shown ? (
              <>
                {shownCategory ? (
                  <label className="inline-flex h-6 items-center gap-1 rounded-chip bg-wash-active pl-2 pr-1 text-xs font-medium">
                    <span className="sr-only">{tr('capture.category')}</span>
                    {/* หมวดที่ server เดา — เปลี่ยนได้ ส่งไปเป็น payloadPatch ตอนบันทึก */}
                    <select
                      value={shownCategory}
                      onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
                      className="bg-transparent text-xs font-medium text-fg focus-visible:outline-none"
                    >
                      {Object.entries(CATEGORY).map(([key, c]) => (
                        <option key={key} value={key}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                {shown.payload.direction === 'income' ? (
                  <Badge tone="success">{tr('capture.income')}</Badge>
                ) : null}
                {shown.payload.isBill ? (
                  <Badge tone="outline">{tr('capture.billBadge')}</Badge>
                ) : null}
              </>
            ) : null
          }
        />
      </div>
    </form>
  );
}
