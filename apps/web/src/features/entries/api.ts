import type {
  BulkActionInput,
  CreateEntryInput,
  EntryDto,
  Paginated,
  ProjectDto,
  TagDto,
  UpdateEntryInput,
} from '@nosion/contracts';
import { apiFetch, toQuery } from '@/lib/api-client';

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

export const entriesApi = {
  list: (filters: EntryFilters) =>
    apiFetch<Paginated<EntryDto>>(`/entries${toQuery({ ...filters })}`),

  create: (input: CreateEntryInput) =>
    apiFetch<EntryDto>('/entries', { method: 'POST', body: input }),

  update: (id: string, input: UpdateEntryInput) =>
    apiFetch<EntryDto>(`/entries/${id}`, { method: 'PATCH', body: input }),

  complete: (id: string) => apiFetch<EntryDto>(`/entries/${id}/complete`, { method: 'POST' }),

  defer: (id: string, to = 'tomorrow') =>
    apiFetch<EntryDto>(`/entries/${id}/defer${toQuery({ to })}`, { method: 'POST' }),

  remove: (id: string) => apiFetch<void>(`/entries/${id}`, { method: 'DELETE' }),

  restore: (id: string) => apiFetch<EntryDto>(`/entries/${id}/restore`, { method: 'POST' }),

  bulk: (input: BulkActionInput) =>
    apiFetch<{ affected: number }>('/entries/bulk', { method: 'POST', body: input }),
};

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
