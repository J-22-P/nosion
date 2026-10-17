'use client';

import { Suspense } from 'react';
import { useSession } from '@/features/auth/use-session';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ThemeSwitcher } from '@/components/shared/theme-switcher';
import { NotificationsCard } from '@/features/notifications/notifications-card';
import { PreferencesCard } from '@/features/notifications/preferences-card';
import { ApiKeysCard } from '@/features/settings/api-keys-card';
import { ConnectedAccountsCard } from '@/features/settings/connected-accounts-card';
import { GitHubCard } from '@/features/settings/github-card';
import { ModulesCard } from '@/features/settings/modules-card';
import { useTranslations } from 'next-intl';
import { LanguageCard } from '@/features/settings/language-card';

export default function SettingsPage() {
  const { user, settings } = useSession();
  const t = useTranslations('settings');

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <Card>
        <CardHeader>
          <CardTitle>{t('profile')}</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-fg-secondary">{t('displayName')}</dt>
              <dd>{user?.displayName ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-fg-secondary">{t('email')}</dt>
              <dd className="break-all">{user?.email ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-fg-secondary">{t('timezone')}</dt>
              <dd>{settings?.timezone ?? '—'}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>
      <Card>
        <CardHeader title={t('display')} description={t('displayHint')} aside={<ThemeSwitcher />} />
      </Card>
      {settings ? <LanguageCard settings={settings} /> : null}
      <ModulesCard />
      <NotificationsCard />
      {settings ? <PreferencesCard settings={settings} /> : null}
      <Suspense fallback={null}>
        <ConnectedAccountsCard isDemo={user?.isDemo ?? false} />
      </Suspense>
      <GitHubCard />
      <ApiKeysCard />
    </div>
  );
}
