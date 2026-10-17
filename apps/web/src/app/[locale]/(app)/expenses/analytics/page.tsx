import { AnalyticsView } from '@/features/expenses/analytics-view';
import { pageMetadata } from '@/i18n/metadata';

export const generateMetadata = pageMetadata('analytics');

export default function ExpenseAnalyticsPage() {
  return <AnalyticsView />;
}
