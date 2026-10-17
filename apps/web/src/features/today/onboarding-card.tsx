'use client';

import type { ModuleKey, OnboardingDto } from '@nosion/contracts';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Check, Rocket, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { cn } from '@nosion/ui';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Kbd } from '@/components/ui/kbd';
import { Progress } from '@/components/ui/progress';
import { useSession } from '@/features/auth/use-session';
import { tr } from '@/i18n/current';
import { apiFetch } from '@/lib/api-client';

const DISMISS_KEY = 'nosion:onboarding-dismissed';

type StepKey = keyof OnboardingDto;

/** ขั้นละหนึ่งการกระทำที่ทำให้แอปเริ่ม "ทำงานให้" — ลิงก์พาไปช่องที่ต้องพิมพ์ทันที (`?new=1` โฟกัสให้) */
const STEPS: { key: StepKey; href: string; module?: ModuleKey }[] = [
  { key: 'task', href: '/tasks?new=1', module: 'task' },
  { key: 'expense', href: '/expenses?new=1', module: 'expense' },
  { key: 'habit', href: '/habits?new=1', module: 'habit' },
  { key: 'push', href: '/settings' },
];

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * การ์ด "เริ่มต้นใช้งาน" (Phase 8 ขั้น 8 · DoD: เพื่อนที่ไม่ใช่ dev ใช้เองได้โดยไม่ต้องอธิบาย)
 * บัญชีใหม่เปิดมาเจอหน้าว่าง — การ์ดนี้บอกว่า "ทำอะไรก่อน" ทีละขั้น และหายไปเองเมื่อทำครบ
 * ขั้นที่เสร็จนับจากข้อมูลจริง (GET /me/onboarding) · ซ่อนเองได้ (จำในเครื่อง) · บัญชีทดลองมีข้อมูลอยู่แล้ว ไม่แสดง
 */
export function OnboardingCard() {
  const { user, settings } = useSession();
  // localStorage อ่านได้หลัง mount เท่านั้น — ตอน render ฝั่ง server ถือว่า "ยังไม่ซ่อน" แล้วค่อยซ่อนหลัง hydrate
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => setDismissed(readDismissed()), []);

  const enabled = (settings?.enabledModules ?? []) as ModuleKey[];
  const query = useQuery({
    queryKey: ['entries', 'onboarding'],
    queryFn: () => apiFetch<OnboardingDto>('/me/onboarding'),
    enabled: Boolean(user) && !user?.isDemo && !dismissed,
    staleTime: 60_000,
  });

  if (!user || user.isDemo || dismissed || !query.data) return null;

  const steps = STEPS.filter((s) => !s.module || enabled.includes(s.module));
  const doneCount = steps.filter((s) => query.data[s.key]).length;
  if (doneCount === steps.length) return null;

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // ซ่อนไม่ได้ถาวร (private mode) — ซ่อนแค่รอบนี้
    }
    setDismissed(true);
  }

  return (
    <Card role="region" aria-labelledby="onboarding-title">
      <CardHeader
        icon={<Rocket />}
        title={<span id="onboarding-title">{tr('onboarding.title')}</span>}
        description={tr('onboarding.description', { done: doneCount, total: steps.length })}
        aside={
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={dismiss}
            aria-label={tr('onboarding.dismiss')}
            title={tr('onboarding.dismiss')}
          >
            <X size={16} aria-hidden="true" />
          </Button>
        }
      />
      <CardContent className="space-y-4">
        <Progress value={doneCount} max={steps.length} label={tr('onboarding.progress')} />
        <ol className="grid gap-2 md:grid-cols-2">
          {steps.map((step, i) => {
            const done = query.data[step.key];
            return (
              <li key={step.key}>
                <Link
                  href={step.href}
                  aria-label={`${tr(`onboarding.step.${step.key}.title`)}${done ? ` · ${tr('onboarding.done')}` : ''}`}
                  className={cn(
                    'group flex h-full items-start gap-3 rounded-row bg-sunken p-4 transition-colors hover:bg-wash-active',
                    'focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]',
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      'flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                      done
                        ? 'bg-primary text-primary-fg'
                        : 'border border-hairline-strong text-fg-secondary',
                    )}
                  >
                    {done ? <Check size={13} strokeWidth={3} /> : i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        'block text-sm font-medium',
                        done && 'text-fg-secondary line-through',
                      )}
                    >
                      {tr(`onboarding.step.${step.key}.title`)}
                    </span>
                    <span className="mt-0.5 block text-xs text-fg-secondary">
                      {tr(`onboarding.step.${step.key}.hint`)}
                    </span>
                  </span>
                  {done ? null : (
                    <ArrowRight
                      size={16}
                      aria-hidden="true"
                      className="mt-0.5 shrink-0 text-fg-secondary transition-transform group-hover:translate-x-0.5"
                    />
                  )}
                </Link>
              </li>
            );
          })}
        </ol>
        <p className="text-xs text-fg-secondary">
          {tr.rich('onboarding.tip', { kbd: (chunks) => <Kbd>{chunks}</Kbd> })}
        </p>
      </CardContent>
    </Card>
  );
}
