'use client';

import type { WeeklyReviewDto } from '@nosion/contracts';
import { MODULE_THEME } from '@nosion/ui';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ErrorState } from '@/components/shared/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { MODULE_ICON } from '@/features/calendar/views';
import { apiFetch, toQuery } from '@/lib/api-client';
import { moduleLabel } from '@/i18n/current';
import { currentLocale, dateFormat, tr } from '@/i18n/current';

const label = (ymd: string) =>
  dateFormat({
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
  }).format(new Date(`${ymd}T00:00:00Z`));

/**
 * หน้าสรุปรายสัปดาห์ (สเปก 8.1 `/review` · Phase 6) — ทุกการ์ดมาจาก `summarizeWeek()` ของโมดูลที่เปิด
 * หน้าไม่รู้จักโมดูลไหนเป็นพิเศษ (ใช้แค่ไอคอน/prefix ประจำโมดูลจาก MODULE_THEME) · ยังไม่มี mockup — ประกอบจาก 8.7
 */
export function ReviewView() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const week = params.get('week') ?? undefined;
  const query = useQuery({
    queryKey: ['entries', 'review', week ?? 'current'],
    queryFn: () => apiFetch<WeeklyReviewDto>(`/review/weekly${toQuery({ week })}`),
    staleTime: 60_000,
    placeholderData: (previous) => previous,
  });
  const data = query.data;
  const go = (w: string) => router.replace(`${pathname}?week=${w}`, { scroll: false });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-semibold leading-tight md:text-[34px]">
            {tr('review.title')}
            {currentLocale() === 'th' ? (
              <>
                {' '}
                <span className="font-normal text-fg-secondary" lang="en">
                  (Review)
                </span>
              </>
            ) : null}
          </h1>
          <p className="mt-1 text-sm text-fg-secondary">
            {data ? (
              <>
                <span className="font-mono">{data.week}</span> · {label(data.from)} –{' '}
                {label(data.to)}
              </>
            ) : (
              tr('review.loading')
            )}
          </p>
        </div>
        {data ? (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={tr('review.prev')}
              onClick={() => go(data.previousWeek)}
            >
              <ChevronLeft size={16} aria-hidden="true" />
            </Button>
            <Button
              variant="secondary"
              size="sm"
              shape="pill"
              onClick={() => router.replace(pathname, { scroll: false })}
            >
              {tr('review.thisWeek')}
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={tr('review.next')}
              onClick={() => go(data.nextWeek)}
            >
              <ChevronRight size={16} aria-hidden="true" />
            </Button>
          </div>
        ) : null}
      </header>

      {query.isError && !data ? (
        <Card>
          <ErrorState message={tr('review.loadFailed')} onRetry={() => void query.refetch()} />
        </Card>
      ) : !data ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-48 rounded-card" />
          <Skeleton className="h-48 rounded-card" />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {data.sections.map((section) => {
            const Icon = MODULE_ICON[section.module];
            return (
              <Card key={section.module}>
                <CardHeader
                  icon={<Icon />}
                  title={section.title}
                  description={MODULE_THEME[section.module].prefix}
                />
                <CardContent className="space-y-4">
                  <dl className="grid grid-cols-3 gap-3">
                    {section.stats.map((s) => (
                      <div key={s.label} className="rounded-row bg-sunken p-3">
                        <dt className="text-xs text-fg-secondary">{s.label}</dt>
                        <dd className="mt-1 font-mono text-lg font-semibold">{s.value}</dd>
                      </div>
                    ))}
                  </dl>
                  {section.highlights.length ? (
                    <ul className="list-disc space-y-1 pl-5 text-sm">
                      {section.highlights.map((h) => (
                        <li key={h}>{h}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-fg-secondary">{tr('review.noHighlights')}</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
          {data.failedModules.length ? (
            <Card>
              <ErrorState
                message={tr('review.partialFailed', {
                  modules: data.failedModules.map((m) => moduleLabel(m)).join(', '),
                })}
                onRetry={() => void query.refetch()}
              />
            </Card>
          ) : null}
        </div>
      )}
    </div>
  );
}
