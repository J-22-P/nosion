import { Suspense } from 'react';
import { Card } from '@/components/ui/card';
import { LoginForm } from '@/features/auth/auth-form';
import { DemoButton } from '@/features/auth/demo-button';
import { OAuthButtons, OAuthErrorAlert } from '@/features/auth/oauth-buttons';
import { pageMetadata } from '@/i18n/metadata';
import { getTranslations, setRequestLocale } from 'next-intl/server';

export const generateMetadata = pageMetadata('login');

/** หน้า static สองภาษา — ต้องบอก locale ให้ next-intl เอง (ไม่งั้นชุดอังกฤษถูกสร้างเป็นภาษาไทย) */
export default async function LoginPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('auth');
  return (
    <div className="space-y-4">
      <Suspense fallback={null}>
        <OAuthErrorAlert />
      </Suspense>
      <Card hero className="p-6 md:p-8">
        <div className="mb-6 space-y-1 text-center">
          <h1 className="text-2xl font-semibold">{t('loginTitle')}</h1>
          <p className="text-sm text-fg-secondary">{t('loginSubtitle')}</p>
        </div>
        <OAuthButtons />
        <Divider label={t('or')} />
        <LoginForm />
      </Card>
      <Divider label={t('or')} />
      <DemoButton variant="secondary" className="w-full" />
    </div>
  );
}

function Divider({ label }: { label: string }) {
  return (
    <div className="my-5 flex items-center gap-3 text-xs text-fg-secondary">
      <span className="h-px flex-1 bg-hairline-strong" />
      {label}
      <span className="h-px flex-1 bg-hairline-strong" />
    </div>
  );
}
