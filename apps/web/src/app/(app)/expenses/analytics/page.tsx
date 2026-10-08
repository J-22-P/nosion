import type { Metadata } from 'next';
import { AnalyticsView } from '@/features/expenses/analytics-view';

export const metadata: Metadata = { title: 'วิเคราะห์การเงิน' };

export default function ExpenseAnalyticsPage() {
  return <AnalyticsView />;
}
