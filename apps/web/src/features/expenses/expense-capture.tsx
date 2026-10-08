'use client';

import type { ExpenseParseDto } from '@nosion/contracts';
import { Plus, Zap } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
              if (e.key === 'Escape') setText('');
            }}
            placeholder="บันทึกด่วนด้วยภาษาธรรมชาติ เช่น ‘กาแฟ 65’, ‘ค่าเน็ต 799’"
            aria-label="บันทึกรายจ่ายด้วยข้อความ"
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
          <span className="hidden sm:inline">บันทึกรายจ่าย</span>
          <span className="sm:hidden">บันทึก</span>
        </Button>
      </div>
      <div id={hintId} aria-live="polite" className="flex min-h-0 flex-wrap gap-1.5">
        {shown ? (
          <div className="flex flex-wrap items-center gap-1.5 pt-3">
            <span className="font-mono text-[11px] uppercase tracking-wider text-fg-secondary">
              Parsed:
            </span>
            <Badge tone="neutral">{CATEGORY[shown.payload.category].label}</Badge>
            <Badge tone="neutral" mono>
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
