'use client';

import { MODULE_KEYS, type CalendarDto, type ModuleKey } from '@nosion/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { entriesApi } from '@/features/entries/api';
import { ApiError } from '@/lib/api-client';
import { DEFAULT_TIME_ZONE } from '@/lib/format';
import { calendarApi } from './api';
import { CALENDAR_VIEWS, todayIn, viewRange, type CalendarView } from './grid';

/**
 * สถานะของหน้าอยู่ใน URL (สเปก 8.11.4): `?view=month|week|agenda` · `?date=YYYY-MM-DD` (วันที่เลือก = day panel)
 * · `?module=task,expense` — แชร์ลิงก์ / กด back แล้วกลับมาที่เดิม
 */
export function useCalendarState(timeZone = DEFAULT_TIME_ZONE) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const rawView = params.get('view');
  const view: CalendarView = CALENDAR_VIEWS.includes(rawView as CalendarView)
    ? (rawView as CalendarView)
    : 'month';
  const rawDate = params.get('date');
  const date = rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : todayIn(timeZone);
  const rawModules = params.get('module');
  const modules = useMemo(
    () =>
      rawModules
        ? rawModules.split(',').filter((m): m is ModuleKey => MODULE_KEYS.includes(m as ModuleKey))
        : null,
    [rawModules],
  );

  const update = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === '') next.delete(key);
        else next.set(key, value);
      }
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  return {
    view,
    date,
    /** null = ทุกโมดูล */
    modules,
    setView: (value: CalendarView) => update({ view: value === 'month' ? null : value }),
    setDate: (value: string) => update({ date: value === todayIn(timeZone) ? null : value }),
    setModules: (value: ModuleKey[] | null) => update({ module: value ? value.join(',') : null }),
  };
}

export const calendarKey = (from: string, to: string) => ['entries', 'calendar', from, to] as const;

/**
 * key ขึ้นต้นด้วย 'entries' — mutation ของ entry ทุกที่ invalidate ['entries'] อยู่แล้ว
 * ติ๊กงานในหน้า Tasks แล้วกลับมาปฏิทินจึงเห็นสถานะใหม่เอง
 */
export function useCalendar(view: CalendarView, date: string, weekStartsOn: number) {
  const range = viewRange(view, date, weekStartsOn);
  const query = useQuery({
    queryKey: calendarKey(range.from, range.to),
    queryFn: () => calendarApi.range(range.from, range.to),
    staleTime: 30_000,
    placeholderData: (previous) => previous, // เลื่อนเดือนแล้ว grid ไม่กระพริบ
  });
  return { ...query, range };
}

/**
 * "Sync latency" ใน footer (สเปก 8.11.4) — อ่าน header `Server-Timing` ของคำขอ /calendar ล่าสุด
 * ผ่าน Resource Timing API (เบราว์เซอร์เปิดให้อ่านเมื่อเป็น same-origin — staging proxy ผ่านโดเมนของเว็บ)
 * อ่านไม่ได้ = null → ไม่แสดงบรรทัดนี้
 */
export function useServerTiming(dataUpdatedAt: number): number | null {
  const [ms, setMs] = useState<number | null>(null);
  useEffect(() => {
    if (!dataUpdatedAt || typeof performance === 'undefined') return;
    const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
    const last = entries.filter((e) => /\/api\/v1\/calendar\?/.test(e.name)).at(-1);
    const timing = last?.serverTiming?.find((t) => t.name === 'calendar');
    setMs(timing ? Math.round(timing.duration) : null);
  }, [dataUpdatedAt]);
  return ms;
}

/** ปุ่ม complete ของ day panel (งาน = ติ๊ก · บิล = จ่ายแล้ว) — อัปเดตแคชทันทีแล้วย้อนกลับถ้าพลาด */
export function useCompleteFromCalendar(from: string, to: string) {
  const queryClient = useQueryClient();
  const key = calendarKey(from, to);
  return useMutation({
    mutationFn: (entryId: string) => entriesApi.complete(entryId),
    onMutate: async (entryId) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<CalendarDto>(key);
      if (previous) {
        queryClient.setQueryData<CalendarDto>(key, {
          ...previous,
          events: previous.events.map((e) =>
            e.entryId === entryId ? { ...e, status: 'done', actions: [] } : e,
          ),
        });
      }
      return { previous };
    },
    onError: (error, _id, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
      toast.error('บันทึกไม่สำเร็จ', {
        description: error instanceof ApiError ? error.message : undefined,
      });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['entries'] });
    },
  });
}

export function useCalendarFeed(enabled: boolean) {
  return useQuery({
    queryKey: ['calendar-feed'],
    queryFn: calendarApi.feed,
    enabled,
    staleTime: Infinity,
  });
}

export function useRotateFeed() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: calendarApi.rotateFeed,
    onSuccess: (feed) => {
      queryClient.setQueryData(['calendar-feed'], feed);
      toast.success('สร้างลิงก์ใหม่แล้ว — ลิงก์เดิมใช้ไม่ได้อีก');
    },
    onError: (error) =>
      toast.error('สร้างลิงก์ใหม่ไม่สำเร็จ', {
        description: error instanceof ApiError ? error.message : undefined,
      }),
  });
}
