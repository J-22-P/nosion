import Link from 'next/link';
import { LogoMark } from '@/components/shell/logo';
import { LocaleSwitcher } from '@/components/shared/locale-switcher';

/** หน้า Login / Register (8.11 — ยังไม่มี mockup จึงประกอบจาก token + component ชุดเดียวกัน) */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-canvas px-4 py-12">
      <div className="w-full max-w-[400px] space-y-8">
        <Link
          href="/"
          className="mx-auto flex w-fit items-center gap-3 rounded-control focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
        >
          <LogoMark size={40} />
          <span className="leading-tight">
            <span className="block text-[15px] font-semibold" lang="en">
              NOSION
            </span>
            <span className="block text-xs text-fg-secondary" lang="en">
              Workspace OS
            </span>
          </span>
        </Link>
        {children}
        <LocaleSwitcher className="justify-center" />
      </div>
    </main>
  );
}
