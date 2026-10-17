import Link from 'next/link';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { DemoButton } from '@/features/auth/demo-button';
import { Button } from '@/components/ui/button';
import { LocaleSwitcher } from '@/components/shared/locale-switcher';
import { CalendarDays, Keyboard, Repeat, Wallet } from 'lucide-react';

const HIGHLIGHTS = ['plugin', 'recurrence', 'reminders', 'offline'] as const;
/** สำหรับคนทั่วไป (ไม่ใช่ dev) — บอก "ได้อะไร" ก่อน "สร้างอย่างไร" */
const FEATURES = [
  { key: 'capture', Icon: Keyboard },
  { key: 'money', Icon: Wallet },
  { key: 'habits', Icon: Repeat },
  { key: 'oneView', Icon: CalendarDays },
] as const;

export default async function LandingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('landing');

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center gap-10 px-6 py-16">
      <header className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm font-medium tracking-widest text-fg-secondary">NOSION</p>
          <LocaleSwitcher />
        </div>
        <h1 className="text-4xl font-bold leading-tight sm:text-5xl">{t('headline')}</h1>
        <p className="max-w-xl text-fg-secondary">{t('intro')}</p>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <div className="space-y-1.5">
          <DemoButton />
          <p className="text-xs text-fg-secondary">{t('tryHint')}</p>
        </div>
        <Link href="/login">
          <Button variant="secondary" size="lg">
            {t('signIn')}
          </Button>
        </Link>
        <Link href="/register" className="text-sm text-fg-secondary underline">
          {t('register')}
        </Link>
      </div>

      <section aria-labelledby="features" className="space-y-4">
        <h2 id="features" className="text-xl font-semibold">
          {t('featuresTitle')}
        </h2>
        <ul className="grid gap-4 sm:grid-cols-2">
          {FEATURES.map(({ key, Icon }) => (
            <li
              key={key}
              className="flex gap-3 rounded-card border border-hairline bg-surface p-5 shadow-card"
            >
              <span
                aria-hidden="true"
                className="flex size-10 shrink-0 items-center justify-center rounded-control bg-sunken"
              >
                <Icon size={18} />
              </span>
              <span>
                <span className="block font-medium">{t(`features.${key}.title`)}</span>
                <span className="mt-1 block text-sm text-fg-secondary">
                  {t(`features.${key}.detail`)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="highlights" className="space-y-4">
        <h2
          id="highlights"
          className="text-sm font-semibold uppercase tracking-wide text-fg-secondary"
        >
          {t('highlightsTitle')}
        </h2>
        <ul className="grid gap-4 sm:grid-cols-2">
          {HIGHLIGHTS.map((key) => (
            <li
              key={key}
              className="rounded-card border border-hairline bg-surface p-5 shadow-card"
            >
              <p className="font-medium">{t(`highlights.${key}.title`)}</p>
              <p className="mt-1 text-sm text-fg-secondary">{t(`highlights.${key}.detail`)}</p>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
