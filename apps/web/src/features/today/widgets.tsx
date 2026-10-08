'use client';

import type { BillDto, BudgetTone, ModuleKey, TodayWidgetDto } from '@nosion/contracts';
import {
  AlertTriangle,
  CircleCheck,
  Info,
  OctagonAlert,
  Plus,
  Receipt,
  Sparkles,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { cn } from '@nosion/ui';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { baht, bahtExact } from '@/features/expenses/format';
import { ToneBadge } from '@/features/expenses/kpi-cards';
import { PRIORITY_TONE } from '@/lib/format';
import { useCompleteFromToday } from './use-today';

/**
 * การ์ดของหน้า Today — หน้าไม่ได้ hard-code ว่ามีโมดูลอะไร (สเปก 8.11.1)
 * วนตาม widgets[] ที่ API ส่งมา (ลำดับจาก registry) · โมดูลที่มีมุมมองพิเศษลงทะเบียนใน WIDGET_VIEW
 * โมดูลที่ไม่มี (เช่นเปิด Workout ในอนาคต) ยังแสดงได้ด้วย GenericBody
 * หน้าตาตาม mockup nosion_today_dashboard(_desktop_light) — monochrome, สีแดงเหลือไว้แค่สิ่งที่ต้องลงมือ
 */
interface WidgetView {
  icon: LucideIcon;
  href: string;
  /** หัวการ์ดส่วนขวา (ตัวเลข/progress) */
  Aside?: (props: { widget: TodayWidgetDto }) => React.ReactNode;
  /** ป้ายข้างชื่อการ์ด เช่น "เลยกำหนด 1" */
  TitleBadge?: (props: { widget: TodayWidgetDto }) => React.ReactNode;
  Body?: (props: { widget: TodayWidgetDto }) => React.ReactNode;
}

const WIDGET_VIEW: Partial<Record<ModuleKey, WidgetView>> = {
  task: {
    icon: CircleCheck,
    href: '/tasks',
    Aside: TaskAside,
    TitleBadge: OverdueBadge,
    Body: TaskBody,
  },
  expense: { icon: Wallet, href: '/expenses', Body: ExpenseBody },
};

export function WidgetCard({ widget, className }: { widget: TodayWidgetDto; className?: string }) {
  const view = WIDGET_VIEW[widget.module];
  const Icon = view?.icon ?? Sparkles;
  const Body = view?.Body ?? GenericBody;
  return (
    // min-w-0: grid item มี min-width: auto โดยปริยาย → ชื่องานยาว ๆ (truncate) ดันการ์ดกว้างเกินจอมือถือ
    <Card className={cn('flex min-w-0 flex-col', className)}>
      <CardHeader
        icon={<Icon />}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {view ? (
              <Link
                href={view.href}
                className="rounded-[4px] text-lg hover:underline focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
              >
                {widget.title}
              </Link>
            ) : (
              <span className="text-lg">{widget.title}</span>
            )}
            {view?.TitleBadge && !widget.isEmpty ? <view.TitleBadge widget={widget} /> : null}
          </span>
        }
        description={widget.isEmpty ? undefined : widget.subline}
        aside={view?.Aside && !widget.isEmpty ? <view.Aside widget={widget} /> : null}
      />
      <CardContent className="flex flex-1 flex-col gap-4">
        {widget.isEmpty ? (
          <div className="flex flex-1 flex-col items-start justify-center gap-3 rounded-row bg-sunken p-5">
            <p className="text-sm text-fg-secondary">ยังไม่มีรายการวันนี้</p>
            {widget.emptyCta ? (
              <AddLink href={widget.emptyCta.href} label={widget.emptyCta.label} />
            ) : null}
          </div>
        ) : (
          <Body widget={widget} />
        )}
      </CardContent>
    </Card>
  );
}

// ── ส่วนประกอบใช้ร่วม ─────────────────────────────────
/** แจ้งเตือนในการ์ด — พื้นเทา (sunken) ทั้งหมด ยกเว้น danger ที่เป็นสิ่งเดียวที่ต้องเห็นเป็นสี */
const ALERT_STYLE = {
  info: { box: 'bg-sunken', icon: 'text-fg-secondary', Icon: Info },
  warning: { box: 'bg-sunken', icon: 'text-fg', Icon: AlertTriangle },
  danger: { box: 'bg-danger-soft', icon: 'text-danger', Icon: OctagonAlert },
} as const;

function Alerts({ alerts }: { alerts: TodayWidgetDto['alerts'] }) {
  if (!alerts?.length) return null;
  return (
    <ul className="space-y-2">
      {alerts.map((a) => {
        const s = ALERT_STYLE[a.level];
        return (
          <li
            key={a.message}
            className={cn(
              'flex items-start gap-2.5 rounded-row px-4 py-3 text-[13px] text-fg',
              s.box,
            )}
          >
            <s.Icon size={16} aria-hidden="true" className={cn('mt-0.5 shrink-0', s.icon)} />
            <span>{a.message}</span>
          </li>
        );
      })}
    </ul>
  );
}

function AddLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex h-9 items-center gap-2 rounded-chip border border-hairline px-4 text-[13px] font-medium text-fg transition-colors hover:bg-wash focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
    >
      <Plus size={14} aria-hidden="true" /> {label}
    </Link>
  );
}

/** มุมมองกลางสำหรับโมดูลที่ยังไม่มีมุมมองเฉพาะ */
function GenericBody({ widget }: { widget: TodayWidgetDto }) {
  return (
    <>
      <p className="text-lg font-semibold">{widget.headline}</p>
      {widget.progress && widget.progress.total ? (
        <Progress value={widget.progress.done} max={widget.progress.total} label={widget.title} />
      ) : null}
      <Alerts alerts={widget.alerts} />
      {widget.items.length ? (
        <ul className="space-y-2">
          {widget.items.map((i) => (
            <li
              key={i.entryId}
              className="flex justify-between gap-3 rounded-row bg-sunken px-4 py-3 text-sm"
            >
              <span className="truncate">{i.title}</span>
              {i.detail ? <span className="shrink-0 text-fg-secondary">{i.detail}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {widget.actions?.length ? (
        <div className="mt-auto flex flex-wrap gap-2">
          {widget.actions.map((a) => (
            <AddLink key={a.href} href={a.href} label={a.label} />
          ))}
        </div>
      ) : null}
    </>
  );
}

// ── งาน ──────────────────────────────────────────────
const overdueOf = (w: TodayWidgetDto) =>
  Number((w.data as { overdueCount?: number } | undefined)?.overdueCount ?? 0);

function OverdueBadge({ widget }: { widget: TodayWidgetDto }) {
  const n = overdueOf(widget);
  return n > 0 ? <Badge tone="danger">เลยกำหนด {n}</Badge> : null;
}

/** หัวการ์ดขวา: แถบ progress สั้น + เปอร์เซ็นต์ (mockup) */
function TaskAside({ widget }: { widget: TodayWidgetDto }) {
  const p = widget.progress;
  if (!p?.total) return null;
  const pct = Math.round((p.done / p.total) * 100);
  return (
    <div className="flex h-9 items-center gap-3 rounded-chip bg-sunken px-3">
      <Progress
        value={p.done}
        max={p.total}
        label="งานวันนี้ที่เสร็จแล้ว"
        className="w-12 sm:w-24"
      />
      <span className="nums font-mono text-xs font-medium">{pct}%</span>
    </div>
  );
}

const PRIORITY_TAG: Record<string, string> = {
  urgent: '!urgent',
  high: '!high',
  medium: '!medium',
  low: '!low',
};

function TaskBody({ widget }: { widget: TodayWidgetDto }) {
  const complete = useCompleteFromToday();
  return (
    <>
      <ul className="space-y-2">
        {widget.items.map((item) => {
          const done = item.status === 'done';
          const tone = item.priority ? PRIORITY_TONE[item.priority] : null;
          return (
            <li
              key={item.entryId}
              className="flex items-start gap-3 rounded-row bg-sunken px-4 py-3.5"
            >
              <Checkbox
                checked={done}
                disabled={done || complete.isPending}
                onCheckedChange={() => complete.mutate(item.entryId)}
                aria-label={done ? `"${item.title}" เสร็จแล้ว` : `ทำ "${item.title}" เสร็จแล้ว`}
                className="mt-0.5"
              />
              <div className="min-w-0 flex-1">
                <p className="flex min-w-0 items-center gap-2">
                  <span
                    className={cn(
                      'truncate text-[15px] font-medium',
                      done && 'font-normal text-fg-secondary line-through',
                    )}
                  >
                    {item.title}
                  </span>
                  {!done && tone && item.priority && item.priority !== 'none' ? (
                    <Badge tone={tone} mono className="h-5 px-2">
                      {PRIORITY_TAG[item.priority]}
                    </Badge>
                  ) : null}
                </p>
                {done ? (
                  <p className="mt-0.5 font-mono text-xs text-fg-secondary">เสร็จแล้ววันนี้</p>
                ) : item.detail ? (
                  <p className="mt-0.5 font-mono text-xs text-danger">{item.detail}</p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      <div className="mt-auto">
        <AddLink href="/tasks?new=1" label="เพิ่มงานใหม่" />
      </div>
    </>
  );
}

// ── การเงิน ─────────────────────────────────────────
interface ExpenseData {
  currency: string;
  todaySpentMinor: number;
  monthSpentMinor: number;
  budgetMinor: number | null;
  budgetTone: BudgetTone;
  nextBill: BillDto | null;
}

function ExpenseBody({ widget }: { widget: TodayWidgetDto }) {
  const d = widget.data as unknown as ExpenseData | undefined;
  if (!d) return <GenericBody widget={widget} />;
  const pct = d.budgetMinor ? Math.round((d.monthSpentMinor / d.budgetMinor) * 1000) / 10 : null;
  return (
    <>
      {/* แผงใน (level 1.5): ซ้าย = วันนี้ · ขวา = สะสมเดือนนี้ (mockup) */}
      <div className="grid grid-cols-2 gap-4 rounded-row bg-sunken p-4 md:p-5">
        <div className="min-w-0">
          <p className="text-xs text-fg-secondary">ใช้จ่ายวันนี้</p>
          <p
            className="nums mt-1 text-[32px] font-semibold leading-none tracking-display md:text-[40px]"
            lang="en"
          >
            {baht(d.todaySpentMinor, d.currency)}
          </p>
          <p className="mt-2 text-xs text-fg-secondary">{widget.items.length} รายการ</p>
        </div>
        <div className="min-w-0 text-right">
          <p className="text-xs text-fg-secondary">สะสมเดือนนี้</p>
          <p className="nums mt-1 text-xl font-semibold leading-tight md:text-2xl" lang="en">
            {baht(d.monthSpentMinor, d.currency)}
          </p>
          {d.budgetMinor !== null ? (
            <p className="nums mt-2 text-xs text-fg-secondary" lang="en">
              / {baht(d.budgetMinor, d.currency)} · เหลือ{' '}
              {baht(Math.max(d.budgetMinor - d.monthSpentMinor, 0), d.currency)}
            </p>
          ) : null}
        </div>
      </div>
      {d.budgetMinor !== null ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="text-fg-secondary">การใช้งานงบประมาณ ({pct}%)</span>
            {d.budgetTone !== 'safe' ? <ToneBadge tone={d.budgetTone} /> : null}
          </div>
          <Progress
            value={d.monthSpentMinor}
            max={d.budgetMinor}
            budget
            label="ยอดใช้เดือนนี้เทียบงบ"
            className="h-2"
          />
        </div>
      ) : null}
      <Alerts alerts={widget.alerts} />
      {d.nextBill ? (
        <div className="mt-auto flex items-center gap-3 rounded-row bg-sunken p-4">
          <span
            aria-hidden="true"
            className="flex size-10 shrink-0 items-center justify-center rounded-control bg-surface text-fg-secondary"
          >
            <Receipt size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{d.nextBill.title}</p>
            <p className="text-xs text-fg-secondary">บิลถัดไป</p>
          </div>
          <span className="nums shrink-0 font-mono text-sm font-semibold">
            {bahtExact(d.nextBill.amountMinor, d.nextBill.currency)}
          </span>
        </div>
      ) : null}
    </>
  );
}
