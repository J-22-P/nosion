import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { HabitsView } from '@/features/habits/habits-view';

export const metadata: Metadata = { title: 'นิสัย' };

/** useSearchParams (?new=1) ต้องอยู่ใต้ Suspense เพื่อให้ Next prerender ส่วนที่เหลือได้ */
export default function HabitsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-[480px] w-full rounded-card" />}>
      <HabitsView />
    </Suspense>
  );
}
