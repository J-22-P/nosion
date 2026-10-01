import type { Metadata } from 'next';
import { ExpensesView } from '@/features/expenses/expenses-view';

export const metadata: Metadata = { title: 'การเงิน' };

export default function ExpensesPage() {
  return <ExpensesView />;
}
