'use client';

import type { CreateRecurrenceRuleInput, HabitListDto, HabitPayload } from '@nosion/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { recurrenceApi } from '@/features/recurrence/api';
import { pushUndo } from '@/lib/shortcuts/undo-store';
import { habitsApi } from './api';
import { errorText } from '@/i18n/errors';
import { tr } from '@/i18n/current';

/** ขึ้นต้นด้วย 'entries' — ติ๊กนิสัยจากปฏิทิน / Today แล้วหน้านี้สดเอง (invalidate ['entries'] ที่เดียว) */
export const HABITS_KEY = ['entries', 'habits'] as const;

export function useHabits() {
  return useQuery({ queryKey: HABITS_KEY, queryFn: habitsApi.list, staleTime: 30_000 });
}

const fail = (title: string) => (error: unknown) =>
  toast.error(title, { description: errorText(error) });

/**
 * −1 / +1 และติ๊กทำแล้ว — อัปเดตแคชทันที (กดรัว ๆ ไม่ต้องรอ) แล้วค่อยเชื่อค่าจาก server
 * server กัน +1 พร้อมกันด้วย version (นับไม่หาย) — ค่าในแคชจึงอาจถูกแทนด้วยค่าจริงหลัง settle
 */
export function useHabitProgress() {
  const queryClient = useQueryClient();

  function patchCache(entryId: string, fn: (current: number, target: number) => number) {
    queryClient.setQueryData<HabitListDto>(HABITS_KEY, (old) =>
      old
        ? {
            ...old,
            habits: old.habits.map((h) => {
              if (h.today?.entryId !== entryId) return h;
              const value = Math.max(0, fn(h.today.currentValue, h.targetValue));
              return {
                ...h,
                today: {
                  ...h.today,
                  currentValue: value,
                  status: value >= h.targetValue ? 'done' : 'pending',
                },
              };
            }),
          }
        : old,
    );
  }

  const settle = () => void queryClient.invalidateQueries({ queryKey: ['entries'] });

  const increment = useMutation({
    mutationFn: ({ entryId, delta }: { entryId: string; delta: 1 | -1 }) =>
      habitsApi.increment(entryId, delta),
    onMutate: ({ entryId, delta }) => patchCache(entryId, (v) => v + delta),
    onError: fail(tr('habits.saveFailed')),
    onSettled: settle,
  });

  const check = useMutation({
    mutationFn: ({ entryId, done }: { entryId: string; done: boolean; title: string }) =>
      habitsApi.check(entryId, done),
    onMutate: ({ entryId, done }) => patchCache(entryId, (_v, target) => (done ? target : 0)),
    onSuccess: (_r, { entryId, done, title }) =>
      pushUndo({
        label: tr('habits.undoCheck', {
          action: done ? tr('habits.undoDone') : tr('habits.undoCancel'),
          title,
        }),
        run: () => habitsApi.check(entryId, !done).finally(settle),
      }),
    onError: fail(tr('habits.saveFailed')),
    onSettled: settle,
  });

  return { increment, check };
}

export function useCreateHabit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateRecurrenceRuleInput) => recurrenceApi.create(input),
    onSuccess: (rule) => toast.success(tr('habits.created'), { description: rule.template.title }),
    onError: fail(tr('habits.createFailed')),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ['entries'] }),
  });
}

export function useHabitRule() {
  const queryClient = useQueryClient();
  const settle = () => void queryClient.invalidateQueries({ queryKey: ['entries'] });
  return {
    pause: useMutation({
      mutationFn: ({ ruleId, paused }: { ruleId: string; paused: boolean }) =>
        recurrenceApi.pause(ruleId, paused),
      onSuccess: (_r, { paused }) =>
        toast.success(paused ? tr('habits.pausedToast') : tr('habits.resumedToast')),
      onError: fail(tr('habits.statusFailed')),
      onSettled: settle,
    }),
    remove: useMutation({
      mutationFn: (ruleId: string) => recurrenceApi.remove(ruleId),
      onSuccess: () => toast.success(tr('habits.deleted')),
      onError: fail(tr('habits.deleteFailed')),
      onSettled: settle,
    }),
  };
}

/** payload ของ template นิสัย — ค่าที่ไม่ได้ตั้ง ให้ schema ของ API เติม default */
export type HabitDraft = Pick<HabitPayload, 'kind' | 'targetValue' | 'unit' | 'cadence'> &
  Partial<Pick<HabitPayload, 'deadlineLocalTime' | 'weeklyTarget' | 'subtitle'>>;
