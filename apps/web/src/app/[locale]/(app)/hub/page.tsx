import { HubView } from '@/components/shell/hub-view';
import { pageMetadata } from '@/i18n/metadata';

export const generateMetadata = pageMetadata('hub');

export default function HubPage() {
  return <HubView />;
}
