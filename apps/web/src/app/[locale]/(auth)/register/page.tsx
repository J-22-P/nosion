import { Card } from '@/components/ui/card';
import { RegisterForm } from '@/features/auth/auth-form';
import { OAuthButtons } from '@/features/auth/oauth-buttons';
import { pageMetadata } from '@/i18n/metadata';
import { getTranslations, setRequestLocale } from 'next-intl/server';

export const generateMetadata = pageMetadata('register');

/** หน้า static สองภาษา — ต้องบอก locale ให้ next-intl เอง (ไม่งั้นชุดอังกฤษถูกสร้างเป็นภาษาไทย) */
export default async function RegisterPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('auth');
  return (
    <Card hero className="p-6 md:p-8">
      <div className="mb-6 space-y-1 text-center">
        <h1 className="text-2xl font-semibold">{t('registerTitle')}</h1>
        <p className="text-sm text-fg-secondary">{t('registerSubtitle')}</p>
      </div>
      <OAuthButtons />
      <div className="my-5 flex items-center gap-3 text-xs text-fg-secondary">
        <span className="h-px flex-1 bg-hairline-strong" />
        {t('orEmail')}
        <span className="h-px flex-1 bg-hairline-strong" />
      </div>
      <RegisterForm />
    </Card>
  );
}
