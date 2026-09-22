'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { useCreateEntry, useProjects } from './use-entries';

/** เพิ่มงานเร็ว: พิมพ์ชื่อแล้ว Enter — ฟอร์มเต็มอยู่ในหน้ารายละเอียด (Phase ถัดไป) */
export function QuickAdd() {
  const [title, setTitle] = useState('');
  const [projectId, setProjectId] = useState('');
  const [due, setDue] = useState('');
  const create = useCreateEntry();
  const projects = useProjects();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    create.mutate(
      {
        module: 'task',
        title: trimmed,
        ...(due ? { occurredAt: due } : {}),
        ...(projectId ? { projectId } : {}),
      },
      { onSuccess: () => setTitle('') },
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row">
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="เพิ่มงานใหม่… (กด Enter เพื่อบันทึก)"
        aria-label="ชื่องานใหม่"
        maxLength={200}
        className="flex-1"
      />
      <div className="flex gap-2">
        <Input
          type="date"
          value={due}
          onChange={(e) => setDue(e.target.value)}
          aria-label="กำหนดส่ง"
          className="h-10 w-40"
        />
        <Select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          aria-label="โปรเจกต์"
          className="h-10"
        >
          <option value="">ไม่มีโปรเจกต์</option>
          {projects.data?.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </Select>
        <Button type="submit" disabled={create.isPending || !title.trim()}>
          เพิ่ม
        </Button>
      </div>
    </form>
  );
}
