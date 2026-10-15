'use client';

import type { ExpenseCategory } from '@nosion/contracts';
import { parseAmountToMinor } from '@nosion/core/money';
import { X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { FieldError, Input, Label, Select } from '@/components/ui/input';
import { defaultDraft, toRuleInput, validateDraft } from '@/features/recurrence/builder';
import { RecurrenceBuilder } from '@/features/recurrence/recurrence-builder';
import { useCreateRule } from '@/features/recurrence/use-recurrence';
import { ApiError } from '@/lib/api-client';
import { DEFAULT_TIME_ZONE } from '@/lib/format';
import { CATEGORY, PAYMENT_LABEL } from './categories';

type PaymentMethod = keyof typeof PAYMENT_LABEL;

/** 'YYYY-MM-DD' ของวันนี้ตามโซนผู้ใช้ — ไม่ใช้วันที่ของเครื่อง (สเปก 8.9) */
function todayYmd(timeZone = DEFAULT_TIME_ZONE): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date());
}

/**
 * "เพิ่มรอบบิลใหม่" (สเปก 8.11.3) — ชื่อ + จำนวนเงิน + ตัวสร้างกฎการเกิดซ้ำ → POST /recurrence-rules
 * API สร้างรายการล่วงหน้า 90 วันทันที บิลจึงขึ้นในการ์ด "บิลประจำ" โดยไม่ต้องรอ cron
 * ใช้ <dialog> แบบเดียวกับ StandupSheet (focus trap / Esc / backdrop มาจากเบราว์เซอร์)
 */
export function NewBillDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      // autoFocus ของ React ทำงานตอน mount ซึ่งเกิดก่อน showModal() แล้วโฟกัสถูกย้ายไปปุ่มปิด → โฟกัสเองหลังเปิด
      dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="new-bill-title"
      className="m-auto max-h-[calc(100dvh-32px)] w-[min(760px,calc(100vw-32px))] overflow-y-auto rounded-panel border border-hairline bg-surface p-0 text-fg shadow-float backdrop:bg-black/40"
    >
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-hairline bg-surface px-5 py-4">
        <h2 id="new-bill-title" className="text-base font-semibold">
          เพิ่มรอบบิลใหม่
        </h2>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="ปิด">
          <X size={16} aria-hidden="true" />
        </Button>
      </div>
      {/* เนื้อหาเฉพาะตอนเปิด — เปิดใหม่ได้ฟอร์มสะอาด และไม่ยิง preview ตอนซ่อนอยู่ */}
      {open ? <NewBillForm onDone={onClose} /> : null}
    </dialog>
  );
}

function NewBillForm({ onDone }: { onDone: () => void }) {
  const id = useId();
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('utilities');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('transfer');
  const [draft, setDraft] = useState(() => defaultDraft(todayYmd()));
  const [touched, setTouched] = useState(false);
  const create = useCreateRule();

  const amountMinor = parseAmountToMinor(amount.replace(/[฿\s]/g, ''));
  const errors = {
    title: title.trim() ? undefined : 'ใส่ชื่อบิล',
    amount: amountMinor && amountMinor > 0 ? undefined : 'ใส่จำนวนเงิน เช่น 799 หรือ 1,250.50',
  };
  const ruleInvalid = Object.keys(validateDraft(draft)).length > 0;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (errors.title || errors.amount || ruleInvalid || create.isPending) return;
    create.mutate(
      {
        ...toRuleInput(draft),
        template: {
          module: 'expense',
          title: title.trim(),
          isAllDay: true,
          payload: {
            amountMinor: amountMinor!,
            category,
            paymentMethod,
            costType: 'fixed',
            isBill: true,
          },
        },
      },
      {
        onSuccess: () => {
          toast.success('ตั้งรอบบิลแล้ว', { description: title.trim() });
          onDone();
        },
        onError: (error) =>
          toast.error('ตั้งรอบบิลไม่สำเร็จ', {
            description: error instanceof ApiError ? error.message : undefined,
          }),
      },
    );
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-5 p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label htmlFor={`${id}-title`}>ชื่อบิล</Label>
          <Input
            id={`${id}-title`}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="เช่น ค่าเน็ต AIS Fibre"
            maxLength={200}
            aria-invalid={touched && !!errors.title}
            data-autofocus
          />
          <FieldError>{touched ? errors.title : undefined}</FieldError>
        </div>
        <div>
          <Label htmlFor={`${id}-amount`}>จำนวนเงิน (บาท)</Label>
          <Input
            id={`${id}-amount`}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder="799"
            className="font-mono"
            aria-invalid={touched && !!errors.amount}
          />
          <FieldError>{touched ? errors.amount : undefined}</FieldError>
        </div>
        <div className="flex gap-3">
          <div className="min-w-0 flex-1">
            <Label htmlFor={`${id}-category`}>หมวด</Label>
            <Select
              id={`${id}-category`}
              value={category}
              onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
              className="w-full"
            >
              {Object.entries(CATEGORY).map(([key, c]) => (
                <option key={key} value={key}>
                  {c.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="min-w-0 flex-1">
            <Label htmlFor={`${id}-payment`}>จ่ายด้วย</Label>
            <Select
              id={`${id}-payment`}
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
              className="w-full"
            >
              {Object.entries(PAYMENT_LABEL).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </div>

      <div className="border-t border-hairline pt-5">
        <RecurrenceBuilder value={draft} onChange={setDraft} />
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone}>
          ยกเลิก
        </Button>
        <Button type="submit" disabled={create.isPending}>
          {create.isPending ? 'กำลังบันทึก…' : 'ตั้งรอบบิล'}
        </Button>
      </div>
    </form>
  );
}
