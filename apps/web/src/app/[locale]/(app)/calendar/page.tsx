import { Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { CalendarView } from '@/features/calendar/calendar-view';
import { pageMetadata } from '@/i18n/metadata';

export const generateMetadata = pageMetadata('calendar');

/** useSearchParams ต้องอยู่ใต้ Suspense เพื่อให้ Next prerender ส่วนที่เหลือได้ */
export default function CalendarPage() {
  return (
    <Suspense fallback={<Skeleton className="h-[560px] w-full rounded-card" />}>
      <CalendarView />
    </Suspense>
  );
}
