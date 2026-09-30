import type { Metadata } from 'next';
import { HubView } from '@/components/shell/hub-view';

export const metadata: Metadata = { title: 'สรุป' };

export default function HubPage() {
  return <HubView />;
}
