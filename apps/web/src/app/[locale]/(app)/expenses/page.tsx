import { ExpensesView } from '@/features/expenses/expenses-view';
import { pageMetadata } from '@/i18n/metadata';

export const generateMetadata = pageMetadata('expenses');

export default function ExpensesPage() {
  return <ExpensesView />;
}
