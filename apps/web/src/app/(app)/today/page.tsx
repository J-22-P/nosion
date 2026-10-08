import type { Metadata } from 'next';
import { Suspense } from 'react';
import { TodayView } from '@/features/today/today-view';

export const metadata: Metadata = { title: 'วันนี้' };

/** useSearchParams (?standup=1) ต้องอยู่ใต้ Suspense เพื่อให้ Next prerender ส่วนที่เหลือได้ */
export default function TodayPage() {
  return (
    <Suspense>
      <TodayView />
    </Suspense>
  );
}
