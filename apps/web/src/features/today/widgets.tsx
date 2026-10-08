'use client';

import type { BillDto, BudgetTone, ModuleKey, TodayWidgetDto } from '@nosion/contracts';
import {
  CircleCheck,
  Info,
  OctagonAlert,
  AlertTriangle,
  Sparkles,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { cn } from '@nosion/ui';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { baht, bahtExact } from '@/features/expenses/format';
import { ToneBadge } from '@/features/expenses/kpi-cards';
import { PRIORITY_LABEL } from '@/lib/format';
import { useCompleteFromToday } from './use-today';

/**
 * การ์ดของหน้า Today — หน้าไม่ได้ hard-code ว่ามีโมดูลอะไร (สเปก 8.11.1)
 * วนตาม widgets[] ที่ API ส่งมา (ลำดับจาก registry) · โมดูลที่มีมุมมองพิเศษลงทะเบียนใน WIDGET_VIEW
 * โมดูลที่ไม่มี (เช่นเปิด Workout ในอนาคต) ยังแสดงได้ด้วย GenericBody
 */
interface WidgetView {
  icon: LucideIcon;
  href: string;
  Body?: (props: { widget: TodayWidgetDto }) => React.ReactNode;
}

const WIDGET_VIEW: Partial<Record<ModuleKey, WidgetView>> = {
  task: { icon: CircleCheck, href: '/tasks', Body: TaskBody },
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
          view ? (
            <Link
              href={view.href}
              className="rounded-[4px] hover:underline focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
            >
              {widget.title}
            </Link>
          ) : (
            widget.title
          )
        }
        description={widget.isEmpty ? undefined : widget.subline}
      />
      <CardContent className="flex flex-1 flex-col gap-4">
        {widget.isEmpty ? (
          <div className="flex flex-1 flex-col items-start gap-3">
            <p className="text-sm text-fg-secondary">ยังไม่มีรายการวันนี้</p>
            {widget.emptyCta ? (
              <Link href={widget.emptyCta.href}>
                <Button variant="secondary" size="sm">
                  {widget.emptyCta.label}
                </Button>
              </Link>
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
const ALERT_STYLE = {
  info: { box: 'bg-accent-soft', icon: 'text-accent', Icon: Info },
  warning: { box: 'bg-warning-soft', icon: 'text-warning', Icon: AlertTriangle },
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
              'flex items-start gap-2 rounded-[12px] px-3 py-2 text-[13px] text-fg',
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

function Actions({ actions }: { actions: TodayWidgetDto['actions'] }) {
  if (!actions?.length) return null;
  return (
    <div className="mt-auto flex flex-wrap gap-2">
      {actions.map((a) => (
        <Link key={a.href} href={a.href}>
          <Button variant="secondary" size="sm">
            {a.label}
          </Button>
        </Link>
      ))}
    </div>
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
        <ul className="space-y-1.5 text-sm">
          {widget.items.map((i) => (
            <li key={i.entryId} className="flex justify-between gap-3">
              <span className="truncate">{i.title}</span>
              {i.detail ? <span className="shrink-0 text-fg-secondary">{i.detail}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
      <Actions actions={widget.actions} />
    </>
  );
}

// ── งาน ──────────────────────────────────────────────
function TaskBody({ widget }: { widget: TodayWidgetDto }) {
  const complete = useCompleteFromToday();
  const progress = widget.progress;
  const overdue = Number((widget.data as { overdueCount?: number } | undefined)?.overdueCount ?? 0);
  const pct = progress?.total ? Math.round((progress.done / progress.total) * 100) : 0;
  return (
    <>
      <div className="flex items-center gap-3">
        {overdue > 0 ? <Badge tone="danger">เลยกำหนด {overdue}</Badge> : null}
        {progress?.total ? (
          <div className="flex flex-1 items-center gap-2">
            <Progress value={progress.done} max={progress.total} label="งานวันนี้ที่เสร็จแล้ว" />
            <span className="nums shrink-0 font-mono text-xs text-fg-secondary">{pct}%</span>
          </div>
        ) : null}
      </div>
      <ul className="space-y-2">
        {widget.items.map((item) => (
          <li key={item.entryId} className="flex items-start gap-3 rounded-row bg-sunken p-3">
            <Checkbox
              checked={false}
              disabled={complete.isPending}
              onCheckedChange={() => complete.mutate(item.entryId)}
              aria-label={`ทำ "${item.title}" เสร็จแล้ว`}
              className="mt-0.5"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{item.title}</p>
              {item.detail ? <p className="text-xs text-danger">{item.detail}</p> : null}
            </div>
            {item.priority && item.priority !== 'none' ? (
              <Badge tone={item.priority === 'urgent' ? 'danger' : 'outline'} className="shrink-0">
                {PRIORITY_LABEL[item.priority]}
              </Badge>
            ) : null}
          </li>
        ))}
      </ul>
      <Actions actions={widget.actions} />
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
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs text-fg-secondary">ใช้จ่ายวันนี้</p>
          <p className="nums text-[32px] font-semibold leading-none tracking-display" lang="en">
            {baht(d.todaySpentMinor, d.currency)}
          </p>
        </div>
        <p className="nums text-right text-sm text-fg-secondary" lang="en">
          {baht(d.monthSpentMinor, d.currency)}
          {d.budgetMinor !== null ? ` / ${baht(d.budgetMinor, d.currency)}` : ''}
        </p>
      </div>
      {d.budgetMinor !== null ? (
        <div className="space-y-1.5">
          <Progress
            value={d.monthSpentMinor}
            max={d.budgetMinor}
            budget
            label="ยอดใช้เดือนนี้เทียบงบ"
          />
          <div className="flex items-center justify-between text-xs text-fg-secondary">
            <span>
              ใช้ไป {pct}% · เหลือ{' '}
              {baht(Math.max(d.budgetMinor - d.monthSpentMinor, 0), d.currency)}
            </span>
            {d.budgetTone !== 'safe' ? <ToneBadge tone={d.budgetTone} /> : null}
          </div>
        </div>
      ) : null}
      <Alerts alerts={widget.alerts} />
      {d.nextBill ? (
        <div className="flex items-center justify-between gap-3 rounded-row bg-sunken p-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{d.nextBill.title}</p>
            <p className="text-xs text-fg-secondary">บิลถัดไป</p>
          </div>
          <span className="nums shrink-0 font-mono text-sm">
            {bahtExact(d.nextBill.amountMinor, d.nextBill.currency)}
          </span>
        </div>
      ) : null}
    </>
  );
}
