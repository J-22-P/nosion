import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

type PageKey =
  | 'today'
  | 'tasks'
  | 'review'
  | 'hub'
  | 'habits'
  | 'expenses'
  | 'analytics'
  | 'calendar'
  | 'settings'
  | 'login'
  | 'register';

/** `export const generateMetadata = pageMetadata('today')` — ชื่อแท็บตามภาษาของหน้า */
export function pageMetadata(key: PageKey) {
  return async function generateMetadata({
    params,
  }: {
    params: Promise<{ locale: string }>;
  }): Promise<Metadata> {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: 'pages' });
    return { title: t(key) };
  };
}
