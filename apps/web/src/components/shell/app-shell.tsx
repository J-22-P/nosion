'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { useSession } from '@/features/auth/use-session';
import { CommandPalette } from '@/features/command-palette/command-palette';
import { useGlobalShortcuts } from '@/lib/shortcuts/use-global-shortcuts';
import { MobileTabBar } from './mobile-tab-bar';
import { ShortcutsDialog } from './shortcuts-dialog';
import { Sidebar } from './sidebar';
import { MobileHeader, TopBar } from './top-bar';
import { useTranslations } from 'next-intl';
import { useLocaleSync } from '@/i18n/use-locale-sync';
import { DemoBanner } from './demo-banner';

/**
 * โครงหน้าแอปหลัก (สเปก 8.2 v1.1)
 * desktop: sidebar 260px + top bar glass · tablet: icon rail 72px · mobile: header + bottom tab bar
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const t = useTranslations('shell');
  const { isLoading, isAuthenticated, user, settings } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.replace('/login');
  }, [isLoading, isAuthenticated, router]);

  useLocaleSync(settings);

  // ปุ่มลัดทั้งระบบ (8.4): ⌘K n / g… j k ? [ ⌘Z
  useGlobalShortcuts();

  if (isLoading) return <ShellSkeleton />;
  if (!isAuthenticated) return null;

  const displayName = user?.displayName ?? '';

  return (
    <div className="flex min-h-dvh bg-canvas">
      <a
        href="#main"
        className="sr-only z-50 rounded-control bg-primary px-4 py-2 text-primary-fg focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        {t('skipToContent')}
      </a>
      <Sidebar pathname={pathname} />
      <div className="flex min-w-0 flex-1 flex-col">
        {user?.isDemo ? <DemoBanner /> : null}
        <TopBar displayName={displayName} isDemo={user?.isDemo ?? false} />
        <MobileHeader pathname={pathname} displayName={displayName} />
        <main
          id="main"
          tabIndex={-1}
          className="mx-auto w-full max-w-[1440px] flex-1 px-4 pb-[calc(88px+env(safe-area-inset-bottom))] pt-5 outline-none sm:px-5 md:px-8 md:pb-10 md:pt-8 lg:px-10"
        >
          {children}
        </main>
      </div>
      <MobileTabBar pathname={pathname} />
      <CommandPalette />
      <ShortcutsDialog />
    </div>
  );
}

function ShellSkeleton() {
  const t = useTranslations('shell');
  return (
    <div className="flex min-h-dvh bg-canvas" aria-busy="true" aria-label={t('loading')}>
      <div className="hidden w-[72px] shrink-0 border-r border-hairline p-3 md:block lg:w-[260px]">
        <Skeleton className="mb-8 mt-2 size-8 rounded-control" />
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="mb-2 h-10 w-full rounded-control" />
        ))}
      </div>
      <div className="flex-1">
        <div className="h-14 border-b border-hairline md:h-16" />
        <div className="space-y-4 p-5 md:p-10">
          <Skeleton className="h-9 w-56" />
          <Skeleton className="h-40 w-full rounded-card" />
        </div>
      </div>
    </div>
  );
}
