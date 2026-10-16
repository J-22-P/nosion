'use client';

import type {
  CreateEntryInput,
  EntryDto,
  Paginated,
  SyncEditableFields,
  UpdateEntryInput,
} from '@nosion/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api-client';
import { cachedEntry, isQueued } from '@/lib/sync';
import { entriesApi, pickBase, projectsApi, tagsApi, type EntryFilters } from './api';

const entriesKey = (filters: EntryFilters) => ['entries', filters] as const;

export function useEntries(filters: EntryFilters) {
  return useQuery({
    queryKey: entriesKey(filters),
    queryFn: () => entriesApi.list(filters),
    staleTime: 30_000,
    placeholderData: (previous) => previous, // กันหน้ากระพริบตอนเปลี่ยน filter
  });
}

export function useProjects() {
  return useQuery({ queryKey: ['projects'], queryFn: projectsApi.list, staleTime: 5 * 60 * 1000 });
}

export function useTags() {
  return useQuery({ queryKey: ['tags'], queryFn: tagsApi.list, staleTime: 5 * 60 * 1000 });
}

/** ต่อท้ายข้อความสำเร็จเมื่อทำตอนออฟไลน์ (เข้าคิวแล้ว ยังไม่ถึง server) */
export const QUEUED_NOTE = 'บันทึกในเครื่องแล้ว จะซิงก์เมื่อออนไลน์';

/**
 * ทุก mutation ใช้รูปแบบเดียวกัน: อัปเดตแคชทันที (optimistic) → ถ้าพลาดย้อนกลับ + แจ้งเตือน
 * ผู้ใช้จึงไม่ต้องรอ round-trip ในการติ๊กงานเสร็จ ซึ่งเป็นสิ่งที่ทำบ่อยที่สุดในแอป
 */
function useOptimisticEntryMutation<TVariables>(
  filters: EntryFilters,
  mutationFn: (vars: TVariables) => Promise<unknown>,
  applyLocally: (entries: EntryDto[], vars: TVariables) => EntryDto[],
  errorMessage: string,
  /** เรียกก่อนแก้แคช — ใช้เก็บค่าก่อนแก้ (base) ให้ operation ตอนออฟไลน์ */
  beforeApply?: (vars: TVariables) => void,
) {
  const queryClient = useQueryClient();
  const key = entriesKey(filters);

  return useMutation({
    mutationFn,
    onMutate: async (vars: TVariables) => {
      beforeApply?.(vars);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Paginated<EntryDto>>(key);
      if (previous) {
        queryClient.setQueryData<Paginated<EntryDto>>(key, {
          ...previous,
          data: applyLocally(previous.data, vars),
        });
      }
      return { previous };
    },
    onError: (error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
      const detail = error instanceof ApiError ? error.message : '';
      toast.error(errorMessage, { description: detail || undefined });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['entries'] });
    },
  });
}

export function useCompleteEntry(filters: EntryFilters) {
  return useOptimisticEntryMutation<string>(
    filters,
    (id) => entriesApi.complete(id),
    (entries, id) =>
      entries.map((e) =>
        e.id === id ? { ...e, status: 'done', completedAt: new Date().toISOString() } : e,
      ),
    'ทำเครื่องหมายว่าเสร็จไม่สำเร็จ',
  );
}

export function useDeferEntry(filters: EntryFilters) {
  return useOptimisticEntryMutation<{ id: string; to: string }>(
    filters,
    ({ id, to }) => entriesApi.defer(id, to),
    (entries, { id }) => entries.filter((e) => e.id !== id),
    'เลื่อนงานไม่สำเร็จ',
  );
}

export function useDeleteEntry(filters: EntryFilters) {
  return useOptimisticEntryMutation<string>(
    filters,
    (id) => entriesApi.remove(id),
    (entries, id) => entries.filter((e) => e.id !== id),
    'ลบงานไม่สำเร็จ',
  );
}

type UpdateVars = { id: string; input: UpdateEntryInput };
/** ค่าก่อนแก้ของแต่ละคำสั่ง (ผูกกับ object ของ vars) — onMutate แก้แคชก่อน mutationFn จะได้อ่าน */
const basesByVars = new WeakMap<UpdateVars, SyncEditableFields>();

export function useUpdateEntry(filters: EntryFilters) {
  return useOptimisticEntryMutation<UpdateVars>(
    filters,
    (vars) => entriesApi.update(vars.id, vars.input, basesByVars.get(vars)),
    (entries, { id, input }) =>
      entries.map((e) => (e.id === id ? { ...e, ...(input as Partial<EntryDto>) } : e)),
    'บันทึกการแก้ไขไม่สำเร็จ',
    (vars) =>
      basesByVars.set(vars, pickBase(cachedEntry(vars.id), vars.input as SyncEditableFields)),
  );
}

export function useCreateEntry(
  messages: { success: string; error: string } = {
    success: 'เพิ่มงานแล้ว',
    error: 'เพิ่มงานไม่สำเร็จ',
  },
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateEntryInput) => entriesApi.create(input),
    onSuccess: (entry) => {
      toast.success(messages.success, {
        description: isQueued(entry) ? `${entry.title} · ${QUEUED_NOTE}` : entry.title,
      });
      void queryClient.invalidateQueries({ queryKey: ['entries'] });
    },
    onError: (error) => {
      toast.error(messages.error, {
        description: error instanceof ApiError ? error.message : undefined,
      });
    },
  });
}

/**
 * เปิดงานที่เสร็จแล้วกลับมาทำต่อ (ปุ่ม ↶ ในกลุ่ม "เสร็จสิ้นแล้ว" และ undo ใน toast)
 * ใช้ version ล่าสุดของ entry เสมอ — ถ้ามีคนแก้ไปก่อน API จะตอบ 409 แทนที่จะทับกัน
 */
export function useReopenEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (entry: Pick<EntryDto, 'id' | 'version'>) =>
      entriesApi.update(entry.id, { status: 'pending', version: entry.version }),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['entries'] });
    },
    onError: (error) => {
      toast.error('ย้อนกลับไม่สำเร็จ', {
        description: error instanceof ApiError ? error.message : undefined,
      });
    },
  });
}
