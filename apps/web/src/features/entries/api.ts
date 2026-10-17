import type {
  BulkActionInput,
  CreateEntryInput,
  EntryDto,
  Paginated,
  ProjectDto,
  SyncEditableFields,
  TagDto,
  UpdateEntryInput,
} from '@nosion/contracts';
import { apiFetch, toQuery } from '@/lib/api-client';
import { cachedEntry, localId, offlineCapable, targetOf } from '@/lib/sync';

export interface EntryFilters {
  module?: string;
  status?: string;
  priority?: string;
  projectId?: string;
  tagIds?: string;
  from?: string;
  to?: string;
  q?: string;
  overdue?: boolean;
  inbox?: boolean;
  sort?: string;
  limit?: number;
  cursor?: string;
}

/** field ที่แก้ตอนออฟไลน์ได้ (ตรงกับ operation update ของ /sync/push) */
const EDITABLE = [
  'title',
  'description',
  'status',
  'priority',
  'occurredAt',
  'isAllDay',
  'projectId',
  'payload',
] as const;

function pickEditable(source: Partial<Record<string, unknown>>): SyncEditableFields {
  const out: Record<string, unknown> = {};
  for (const key of EDITABLE) if (source[key] !== undefined) out[key] = source[key];
  return out as SyncEditableFields;
}

/**
 * ภาพรายการหลังทำ ฝั่ง client คาดเอง (ตอนเข้าคิวออฟไลน์) — จากแคชถ้ามี
 * version คงเดิม: operation ที่ตามมา (เช่น เลิกทำ) เข้าคิวต่อท้ายอยู่แล้วจึงไม่ได้ใช้ version ตัดสิน
 */
function projected(id: string, patch: Partial<EntryDto>): EntryDto {
  const now = new Date().toISOString();
  const base: EntryDto = cachedEntry(id) ?? {
    id,
    module: 'task',
    title: '',
    description: null,
    status: 'pending',
    priority: 'none',
    occurredAt: null,
    isAllDay: true,
    completedAt: null,
    payload: {},
    projectId: null,
    parentId: null,
    recurrenceRuleId: null,
    tags: [],
    sortOrder: 0,
    version: 1,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  return { ...base, ...patch, updatedAt: now };
}

/**
 * mutation ของรายการทุกตัวผ่าน offlineCapable — ออฟไลน์/เน็ตหลุดจะเข้าคิว (outbox) แทนการล้ม
 * แล้วคืน "ภาพที่คาดไว้" ให้ผู้เรียกทำงานต่อได้เหมือนสำเร็จ (ดู lib/sync · Phase 7)
 */
export const entriesApi = {
  list: (filters: EntryFilters) =>
    apiFetch<Paginated<EntryDto>>(`/entries${toQuery({ ...filters })}`),

  get: (id: string) => apiFetch<EntryDto>(`/entries/${id}`),

  create: (input: CreateEntryInput) => {
    const clientId = input.clientId ?? `c-${crypto.randomUUID()}`;
    return offlineCapable({
      online: () =>
        apiFetch<EntryDto>('/entries', { method: 'POST', body: { ...input, clientId } }),
      op: () => ({ op: 'create', data: { ...input, clientId } }),
      local: () =>
        projected(localId(clientId), {
          module: input.module,
          title: input.title,
          description: input.description ?? null,
          status: input.status ?? 'pending',
          priority: input.priority ?? 'none',
          occurredAt: typeof input.occurredAt === 'string' ? input.occurredAt : null,
          isAllDay: input.isAllDay ?? true,
          payload: input.payload ?? {},
          projectId: input.projectId ?? null,
        }),
    });
  },

  /**
   * `base` = ค่าก่อนแก้ของ field ที่แก้ (ใช้ตัดสิน conflict ระดับ field ตอนซิงก์)
   * ไม่ส่งมา = อ่านจากแคช — ผู้เรียกที่อัปเดตแคชแบบ optimistic ไปก่อนต้องส่งเอง
   */
  update: (id: string, input: UpdateEntryInput, base?: SyncEditableFields) => {
    const data = pickEditable(input);
    return offlineCapable({
      online: () => apiFetch<EntryDto>(`/entries/${id}`, { method: 'PATCH', body: input }),
      op: () => ({
        op: 'update',
        target: targetOf(id),
        data,
        base: base ?? pickBase(cachedEntry(id), data),
      }),
      local: () => projected(id, data as Partial<EntryDto>),
    });
  },

  complete: (id: string) =>
    offlineCapable({
      online: () => apiFetch<EntryDto>(`/entries/${id}/complete`, { method: 'POST' }),
      op: () => ({ op: 'complete', target: targetOf(id) }),
      local: () => projected(id, { status: 'done', completedAt: new Date().toISOString() }),
    }),

  defer: (id: string, to = 'tomorrow') =>
    offlineCapable({
      online: () =>
        apiFetch<EntryDto>(`/entries/${id}/defer${toQuery({ to })}`, { method: 'POST' }),
      op: () => ({ op: 'defer', target: targetOf(id), to }),
      // วันใหม่คำนวณที่ server ตอนซิงก์ (เขตเวลา/วันหยุดของผู้ใช้) — ฝั่งนี้คงวันเดิมไว้
      local: () => projected(id, {}),
    }),

  remove: (id: string) =>
    offlineCapable<void>({
      online: () => apiFetch<void>(`/entries/${id}`, { method: 'DELETE' }),
      op: () => ({ op: 'delete', target: targetOf(id) }),
      local: () => undefined,
    }),

  restore: (id: string) =>
    offlineCapable({
      online: () => apiFetch<EntryDto>(`/entries/${id}/restore`, { method: 'POST' }),
      op: () => ({ op: 'restore', target: targetOf(id) }),
      local: () => projected(id, { deletedAt: null }),
    }),

  /** ทำหลายรายการพร้อมกัน — ต้องออนไลน์ (เลือกจากรายการที่เห็นบนจอ ใช้ไม่บ่อยตอนออฟไลน์) */
  bulk: (input: BulkActionInput) =>
    apiFetch<{ affected: number }>('/entries/bulk', { method: 'POST', body: input }),
};

/** ค่าก่อนแก้ของ field ที่จะแก้ — ไม่มีในแคช = ไม่รู้ (server ถือว่าไม่มีใครแก้ระหว่างนั้น) */
export function pickBase(entry: EntryDto | null, data: SyncEditableFields): SyncEditableFields {
  if (!entry) return {};
  const base: Record<string, unknown> = {};
  for (const key of Object.keys(pickEditable(data))) {
    if (key === 'payload') {
      const payload = entry.payload ?? {};
      base.payload = Object.fromEntries(
        Object.keys(data.payload ?? {}).map((k) => [k, payload[k]]),
      );
    } else base[key] = entry[key as keyof EntryDto];
  }
  return base as SyncEditableFields;
}

export const projectsApi = {
  list: () => apiFetch<ProjectDto[]>('/projects'),
  create: (input: { name: string; color?: string }) =>
    apiFetch<ProjectDto>('/projects', { method: 'POST', body: input }),
};

export const tagsApi = {
  list: () => apiFetch<TagDto[]>('/tags'),
  create: (input: { name: string; color?: string }) =>
    apiFetch<TagDto>('/tags', { method: 'POST', body: input }),
};
