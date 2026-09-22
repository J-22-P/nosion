'use client';

import { CalendarDays, CheckSquare, Dumbbell, LogOut, Moon, Repeat, Settings, Sun, Wallet } from 'lucide-react';
import { useTheme } from 'next-themes';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { cn } from '@nosion/ui';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { authApi } from '@/features/auth/api';
import { useAuthStore } from '@/features/auth/auth-store';
import { useSession } from '@/features/auth/use-session';

const NAV = [
  { href: '/today', label: 'วันนี้', icon: CalendarDays, ready: true },
  { href: '/tasks', label: 'งาน', icon: CheckSquare, ready: true },
  { href: '/expenses', label: 'การเงิน', icon: Wallet, ready: false },
  { href: '/workouts', label: 'ออกกำลังกาย', icon: Dumbbell, ready: false },
  { href: '/habits', label: 'นิสัย', icon: Repeat, ready: false },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const { isLoading, isAuthenticated, user } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.replace('/login');
  }, [isLoading, isAuthenticated, router]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen">
        <div className="hidden w-56 border-r border-[var(--border)] p-4 md:block">
          <Skeleton className="mb-6 h-6 w-24" />
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="mb-2 h-9 w-full" />
          ))}
        </div>
        <div className="flex-1 p-6">
          <Skeleton className="h-8 w-48" />
        </div>
      </div>
    );
  }

  if (!isAuthenticated) return null;

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar pathname={pathname} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar displayName={user?.displayName ?? ''} isDemo={user?.isDemo ?? false} />
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 pb-24 md:px-8 md:pb-6">
          {children}
        </main>
        <MobileNav pathname={pathname} />
      </div>
    </div>
  );
}

function Sidebar({ pathname }: { pathname: string }) {
  return (
    <nav
      aria-label="เมนูหลัก"
      className="hidden w-56 shrink-0 border-r border-[var(--border)] bg-[var(--card)] p-3 md:block"
    >
      <p className="px-3 py-4 text-sm font-semibold tracking-widest">NOSION</p>
      <ul className="space-y-1">
        {NAV.map((item) => (
          <li key={item.href}>
            <NavLink item={item} active={pathname.startsWith(item.href)} />
          </li>
        ))}
      </ul>
      <div className="mt-6 border-t border-[var(--border)] pt-3">
        <NavLink
          item={{ href: '/settings', label: 'ตั้งค่า', icon: Settings, ready: true }}
          active={pathname.startsWith('/settings')}
        />
      </div>
    </nav>
  );
}

type NavItem = { href: string; label: string; icon: typeof CheckSquare; ready: boolean };

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  const className = cn(
    'flex items-center gap-3 rounded-[var(--radius)] px-3 py-2 text-sm transition-colors',
    active
      ? 'bg-[var(--accent)] font-medium text-[var(--accent-foreground)]'
      : 'text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]',
  );

  if (!item.ready) {
    return (
      <span className={cn(className, 'cursor-not-allowed opacity-50')} aria-disabled="true">
        <Icon size={16} aria-hidden="true" />
        {item.label}
        <span className="ml-auto text-[10px] uppercase">เร็ว ๆ นี้</span>
      </span>
    );
  }

  return (
    <Link href={item.href} className={className} aria-current={active ? 'page' : undefined}>
      <Icon size={16} aria-hidden="true" />
      {item.label}
    </Link>
  );
}

function TopBar({ displayName, isDemo }: { displayName: string; isDemo: boolean }) {
  const router = useRouter();
  const clear = useAuthStore((s) => s.clear);

  async function logout() {
    await authApi.logout().catch(() => undefined);
    clear();
    router.replace('/login');
  }

  return (
    <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b border-[var(--border)] bg-[var(--background)]/90 px-4 backdrop-blur md:px-8">
      <span className="text-sm font-semibold tracking-widest md:hidden">NOSION</span>
      <div className="ml-auto flex items-center gap-2">
        {isDemo ? (
          <span className="rounded-full bg-[var(--accent)] px-2 py-1 text-xs text-[var(--accent-foreground)]">
            บัญชีทดลอง
          </span>
        ) : null}
        <span className="hidden text-sm text-[var(--muted-foreground)] sm:inline">{displayName}</span>
        <ThemeToggle />
        <Button variant="ghost" size="icon" onClick={logout} aria-label="ออกจากระบบ">
          <LogOut size={16} />
        </Button>
      </div>
    </header>
  );
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="สลับธีมสว่าง/มืด"
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
    >
      {mounted && resolvedTheme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
    </Button>
  );
}

/** มือถือ: sidebar กลายเป็น bottom tab bar (สเปกหัวข้อ 8.2) */
function MobileNav({ pathname }: { pathname: string }) {
  return (
    <nav
      aria-label="เมนูหลัก (มือถือ)"
      className="fixed inset-x-0 bottom-0 z-10 flex border-t border-[var(--border)] bg-[var(--card)] md:hidden"
    >
      {NAV.filter((item) => item.ready)
        .concat([{ href: '/settings', label: 'ตั้งค่า', icon: Settings, ready: true }] as never)
        .map((item) => {
          const Icon = item.icon;
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex flex-1 flex-col items-center gap-1 py-2 text-[11px]',
                active ? 'text-[var(--primary)]' : 'text-[var(--muted-foreground)]',
              )}
            >
              <Icon size={18} aria-hidden="true" />
              {item.label}
            </Link>
          );
        })}
    </nav>
  );
}
