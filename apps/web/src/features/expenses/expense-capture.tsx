'use client';

import type { ExpenseParseDto } from '@nosion/contracts';
import { Sparkles, Wallet } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { useCreateEntry } from '@/features/entries/use-entries';
import { ApiError } from '@/lib/api-client';
import { expensesApi } from './api';
import { CATEGORY } from './categories';
import { bahtExact } from './format';

type Parsed = ExpenseParseDto['result'];

/**
 * บันทึกด่วน "กาแฟ 65" (สเปก 8.11.3) — parser อยู่ฝั่ง server (POST /expenses/parse) ชุดเดียวกับ ⌘K
 * พิมพ์แล้วหน่วง 250ms ค่อยขอ preview → chip "Auto-Detect" บอกหมวด/ยอด/บิล · ↵ บันทึก · Esc ล้าง
 */
export function ExpenseCapture() {
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<{ text: string; result: Parsed } | null>(null);
  const [checking, setChecking] = useState(false);
  const create = useCreateEntry({ success: 'บันทึกรายการแล้ว', error: 'บันทึกรายการไม่สำเร็จ' });
  const hintId = useId();
  const trimmed = text.trim();

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

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!trimmed || create.isPending || checking) return;
    let result: Parsed;
    if (preview?.text === trimmed) {
      result = preview.result;
    } else {
      setChecking(true);
      try {
        result = (await expensesApi.parse(trimmed)).result;
      } catch (error) {
        toast.error('อ่านข้อความไม่สำเร็จ', {
          description: error instanceof ApiError ? error.message : undefined,
        });
        return;
      } finally {
        setChecking(false);
      }
    }
    if (!result) {
      toast.error('ไม่พบจำนวนเงิน', { description: 'ลองพิมพ์แบบ "กาแฟ 65" หรือ "ค่าเน็ต 799"' });
      return;
    }
    create.mutate(
      {
        module: 'expense',
        title: result.title,
        // บิลยังไม่จ่าย = pending · รายจ่ายทั่วไปเกิดขึ้นแล้ว = done
        status: result.payload.isBill ? 'pending' : 'done',
        occurredAt: result.occurredAt,
        isAllDay: result.isAllDay,
        payload: result.payload,
      },
      {
        onSuccess: () => {
          setText('');
          setPreview(null);
        },
      },
    );
  }

  const shown = preview?.text === trimmed ? preview.result : null;

  return (
    <form
      onSubmit={submit}
      className="rounded-card border border-hairline bg-surface p-2 shadow-card transition-shadow focus-within:shadow-[var(--focus-ring)]"
    >
      <div className="flex items-center gap-2">
        <Wallet
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
          placeholder="บันทึกด่วน เช่น ‘กาแฟ 65’, ‘ค่าเน็ต 799 ทุกวันที่ 5’"
          aria-label="บันทึกรายจ่ายด้วยข้อความ"
          aria-describedby={hintId}
          maxLength={200}
          className="h-11 min-w-0 flex-1 bg-transparent text-[15px] text-fg outline-none placeholder:text-fg-tertiary"
        />
        <Button
          type="submit"
          disabled={!trimmed || create.isPending || checking}
          className="shrink-0 gap-2"
        >
          <span className="hidden sm:inline">บันทึกรายจ่าย</span>
          <span className="sm:hidden">บันทึก</span>
          <Kbd className="hidden border-transparent bg-current/15 text-current sm:inline-flex">
            ↵
          </Kbd>
        </Button>
      </div>
      <div id={hintId} aria-live="polite" className="flex min-h-0 flex-wrap gap-1.5 px-2">
        {shown ? (
          <div className="flex flex-wrap items-center gap-1.5 pb-1 pt-2">
            <Badge tone="accent">
              <Sparkles aria-hidden="true" /> Auto-Detect
            </Badge>
            <Badge tone="neutral">{CATEGORY[shown.payload.category].label}</Badge>
            <Badge tone={shown.payload.direction === 'income' ? 'success' : 'neutral'} mono>
              {shown.payload.direction === 'income' ? '+' : '−'}
              {bahtExact(shown.payload.amountMinor, shown.payload.currency)}
            </Badge>
            {shown.payload.isBill ? <Badge tone="outline">บิลประจำ</Badge> : null}
          </div>
        ) : null}
      </div>
    </form>
  );
}
