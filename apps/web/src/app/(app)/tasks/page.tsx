import type { Metadata } from 'next';
import { Suspense } from 'react';
import { TaskListSkeleton } from '@/components/ui/skeleton';
import { TasksView } from '@/features/tasks/tasks-view';

export const metadata: Metadata = { title: 'งาน' };

/** useSearchParams ต้องอยู่ใต้ Suspense เพื่อให้ Next prerender ส่วนที่เหลือได้ */
export default function TasksPage() {
  return (
    <Suspense fallback={<TaskListSkeleton />}>
      <TasksView />
    </Suspense>
  );
}
