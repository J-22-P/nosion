'use client';

import { Input, Select } from '@/components/ui/input';
import { useProjects } from './use-entries';
import type { EntryFilters } from './api';

const STATUS_OPTIONS = [
  { value: 'pending,active', label: 'ยังไม่เสร็จ' },
  { value: '', label: 'ทั้งหมด' },
  { value: 'done', label: 'เสร็จแล้ว' },
];

const SORT_OPTIONS = [
  { value: 'occurredAt:asc', label: 'กำหนดส่งใกล้สุด' },
  { value: 'priority:desc,occurredAt:asc', label: 'ความสำคัญ' },
  { value: 'createdAt:desc', label: 'เพิ่มล่าสุด' },
  { value: 'title:asc', label: 'ชื่อ ก-ฮ' },
];

export function TaskFilters({
  filters,
  onChange,
}: {
  filters: EntryFilters;
  onChange: (next: EntryFilters) => void;
}) {
  const projects = useProjects();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        value={filters.q ?? ''}
        onChange={(e) => onChange({ ...filters, q: e.target.value, cursor: undefined })}
        placeholder="ค้นหางาน…"
        aria-label="ค้นหางาน"
        className="h-9 w-full sm:w-56"
      />

      <Select
        value={filters.status ?? ''}
        onChange={(e) => onChange({ ...filters, status: e.target.value, cursor: undefined })}
        aria-label="สถานะ"
      >
        {STATUS_OPTIONS.map((option) => (
          <option key={option.label} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>

      <Select
        value={filters.projectId ?? ''}
        onChange={(e) => onChange({ ...filters, projectId: e.target.value, cursor: undefined })}
        aria-label="โปรเจกต์"
      >
        <option value="">ทุกโปรเจกต์</option>
        {projects.data?.map((project) => (
          <option key={project.id} value={project.id}>
            {project.name}
          </option>
        ))}
      </Select>

      <Select
        value={filters.sort ?? 'occurredAt:asc'}
        onChange={(e) => onChange({ ...filters, sort: e.target.value, cursor: undefined })}
        aria-label="เรียงตาม"
      >
        {SORT_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>

      <label className="flex items-center gap-2 text-sm text-[var(--muted-foreground)]">
        <input
          type="checkbox"
          checked={filters.overdue ?? false}
          onChange={(e) =>
            onChange({ ...filters, overdue: e.target.checked || undefined, cursor: undefined })
          }
        />
        เฉพาะที่เลยกำหนด
      </label>
    </div>
  );
}
