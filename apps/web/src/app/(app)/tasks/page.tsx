'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { QuickAdd } from '@/features/entries/quick-add';
import { TaskFilters } from '@/features/entries/task-filters';
import { TaskList } from '@/features/entries/task-list';
import type { EntryFilters } from '@/features/entries/api';

const DEFAULT_FILTERS: EntryFilters = {
  module: 'task',
  status: 'pending,active',
  sort: 'occurredAt:asc',
  limit: 50,
};

export default function TasksPage() {
  const [filters, setFilters] = useState<EntryFilters>(DEFAULT_FILTERS);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">งาน</h1>
      </div>

      <QuickAdd />
      <TaskFilters filters={filters} onChange={setFilters} />

      <Card className="overflow-hidden p-0">
        <TaskList filters={filters} />
      </Card>
    </div>
  );
}
