import { Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { ReviewView } from '@/features/review/review-view';
import { pageMetadata } from '@/i18n/metadata';

export const generateMetadata = pageMetadata('review');

/** useSearchParams (?week=) ต้องอยู่ใต้ Suspense เพื่อให้ Next prerender ส่วนที่เหลือได้ */
export default function ReviewPage() {
  return (
    <Suspense fallback={<Skeleton className="h-[480px] w-full rounded-card" />}>
      <ReviewView />
    </Suspense>
  );
}
