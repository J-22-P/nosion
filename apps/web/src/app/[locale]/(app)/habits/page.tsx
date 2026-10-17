import { Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { HabitsView } from '@/features/habits/habits-view';
import { pageMetadata } from '@/i18n/metadata';

export const generateMetadata = pageMetadata('habits');

/** useSearchParams (?new=1) ต้องอยู่ใต้ Suspense เพื่อให้ Next prerender ส่วนที่เหลือได้ */
export default function HabitsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-[480px] w-full rounded-card" />}>
      <HabitsView />
    </Suspense>
  );
}
