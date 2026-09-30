'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { useSession } from '@/features/auth/use-session';
import { useUIStore } from '@/lib/stores/ui-store';
import { MobileTabBar } from './mobile-tab-bar';
import { Sidebar } from './sidebar';
import { MobileHeader, TopBar } from './top-bar';

/** ไม่จับ shortcut ตอนผู้ใช้กำลังพิมพ์ */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
}

/**
 * โครงหน้าแอปหลัก (สเปก 8.2 v1.1)
 * desktop: sidebar 260px + top bar glass · tablet: icon rail 72px · mobile: header + bottom tab bar
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const { isLoading, isAuthenticated, user } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.replace('/login');
  }, [isLoading, isAuthenticated, router]);

  // `[` ยุบ/ขยาย sidebar (8.4)
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== '[' || event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      event.preventDefault();
      toggleSidebar();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleSidebar]);

  if (isLoading) return <ShellSkeleton />;
  if (!isAuthenticated) return null;

  const displayName = user?.displayName ?? '';

  return (
    <div className="flex min-h-dvh bg-canvas">
      <a
        href="#main"
        className="sr-only z-50 rounded-control bg-primary px-4 py-2 text-primary-fg focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        ข้ามไปเนื้อหาหลัก
      </a>
      <Sidebar pathname={pathname} />
      <div className="flex min-w-0 flex-1 flex-col">
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
    </div>
  );
}

function ShellSkeleton() {
  return (
    <div className="flex min-h-dvh bg-canvas" aria-busy="true" aria-label="กำลังโหลด">
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
