'use client';

import { parseNaturalText, remainingText } from '@nosion/core/nl';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CirclePlus } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { useSession } from '@/features/auth/use-session';
import { buildChips, rawFor, replaceSpan, sameName, withDate } from '@/features/capture/nl-chips';
import { ParsedChips } from '@/features/capture/parsed-chips';
import { parseApi } from '@/features/command-palette/api';
import { todayIn } from '@/features/calendar/grid';
import { queuedNote, useProjects, useTags } from '@/features/entries/use-entries';
import { isQueued } from '@/lib/sync';
import { DEFAULT_TIME_ZONE } from '@/lib/format';
import { errorText } from '@/i18n/errors';
import { tr } from '@/i18n/current';

/** ชิ้นที่งานใช้ — จำนวนเงิน/ปริมาณเป็นส่วนของชื่องาน ไม่ใช่ chip (เหมือนฝั่ง API) */
const TASK_CHIPS = [
  'date',
  'time',
  'recurrence',
  'priority',
  'tag',
  'project',
  'duration',
] as const;

const newClientId = () => `qc-${crypto.randomUUID()}`;

/**
 * บันทึกด่วนของงาน (สเปก 8.7.5 / 8.11.2) — NL parser เต็มตั้งแต่ Phase 5 ขั้น 8
 * "ส่งรายงาน พรุ่งนี้ 5 โมง !high #work +q4 ทุกจันทร์" → ↵ · Esc ล้าง
 * chip มาจาก parser ฝั่ง client ทันทีที่พิมพ์ · บันทึกผ่าน POST /parse/commit (server parse ข้อความเดียวกัน
 * แล้วสร้างงาน / กฎการเกิดซ้ำ + การเตือน + แท็ก/โปรเจกต์ที่ยังไม่มี ในคำขอเดียว)
 */
export function QuickCapture() {
  const [text, setText] = useState('');
  const [clientId, setClientId] = useState(newClientId);
  const { settings } = useSession();
  const timeZone = settings?.timezone ?? DEFAULT_TIME_ZONE;
  const projects = useProjects();
  const tags = useTags();
  const queryClient = useQueryClient();
  const hintId = useId();

  const nl = useMemo(
    () =>
      parseNaturalText(text, { now: new Date(), timeZone, weekStartsOn: settings?.weekStartsOn }),
    [text, timeZone, settings?.weekStartsOn],
  );
  const title = remainingText(nl, ['amount', 'quantity']);
  const chips = buildChips(nl, TASK_CHIPS, todayIn(timeZone));
  const dateToken = nl.tokens.find((t) => t.kind === 'date');

  const create = useMutation({
    mutationFn: () => parseApi.commit({ text: text.trim(), module: 'task', clientId }),
    onSuccess: (result) => {
      const { entry, rule } = result;
      toast.success(rule ? tr('quickCapture.addedRecurring') : tr('quickCapture.added'), {
        description: isQueued(result) ? `${entry.title} · ${queuedNote()}` : entry.title,
      });
      void queryClient.invalidateQueries({ queryKey: ['entries'] });
      // แท็ก/โปรเจกต์ใหม่ถูกสร้างที่ server
      void queryClient.invalidateQueries({ queryKey: ['tags'] });
      void queryClient.invalidateQueries({ queryKey: ['projects'] });
      setText('');
      setClientId(newClientId());
    },
    onError: (error) =>
      toast.error(tr('quickCapture.failed'), {
        description: errorText(error),
      }),
  });

  const canSubmit = title.length > 0 && !create.isPending;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (canSubmit) create.mutate();
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-card border border-hairline bg-surface p-2 shadow-card transition-shadow focus-within:shadow-[var(--focus-ring)]"
    >
      <div className="flex items-center gap-2">
        <CirclePlus
          size={20}
          strokeWidth={1.75}
          className="ml-2 shrink-0 text-fg-secondary"
          aria-hidden="true"
        />
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setText('');
          }}
          placeholder={tr('quickCapture.placeholder')}
          aria-label={tr('quickCapture.label')}
          data-shortcut="new"
          aria-describedby={hintId}
          maxLength={200}
          className="h-11 min-w-0 flex-1 bg-transparent text-[15px] text-fg outline-none placeholder:text-fg-tertiary"
        />
        <label className="relative hidden shrink-0 sm:block">
          <span className="sr-only">{tr('quickCapture.due')}</span>
          {/* เลือกวันแล้วเขียนลงข้อความ ("23/10/2026") — ข้อความยังเป็นแหล่งความจริงเดียว */}
          <input
            type="date"
            value={dateToken?.kind === 'date' ? dateToken.value : ''}
            onChange={(e) => setText(withDate(text, nl, e.target.value))}
            className="h-9 rounded-control border border-hairline bg-wash px-2 font-mono text-xs text-fg-secondary outline-none focus-visible:shadow-[var(--focus-ring)]"
          />
        </label>
        <Button type="submit" disabled={!canSubmit} className="shrink-0 gap-2">
          <span className="hidden sm:inline">{tr('quickCapture.create')}</span>
          <span className="sm:hidden">{tr('quickCapture.add')}</span>
          <Kbd className="hidden border-transparent bg-current/15 text-current sm:inline-flex">
            ↵
          </Kbd>
        </Button>
      </div>

      <p id={hintId} className="sr-only">
        {tr('quickCapture.hint1')} {tr('quickCapture.hint2')}
      </p>

      <ParsedChips
        chips={chips}
        onReplace={(chip, raw) =>
          setText((t) => replaceSpan(t, chip.start, chip.end, rawFor(chip.kind, raw)))
        }
        isNew={(chip) =>
          chip.kind === 'tag'
            ? !tags.data?.some((t) => sameName(t.name, chip.value))
            : chip.kind === 'project'
              ? !projects.data?.some((p) => sameName(p.name, chip.value))
              : false
        }
      />
    </form>
  );
}
