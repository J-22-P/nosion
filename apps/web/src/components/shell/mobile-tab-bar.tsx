'use client';

import Link from 'next/link';
import { cn } from '@nosion/ui';
import { HUB_NAV, MOBILE_TABS, isActive, isInHub } from './nav';

/**
 * Bottom tab bar มือถือ 5 ช่อง (8.2) — glass + เคารพ safe-area ใต้ home indicator
 * ไม่มี FAB: quick-add อยู่ใน hero/การ์ดของแต่ละหน้าแทน
 */
export function MobileTabBar({ pathname }: { pathname: string }) {
  return (
    <nav
      aria-label="เมนูหลัก (มือถือ)"
      className="glass fixed inset-x-0 bottom-0 z-20 border-t border-hairline pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="flex">
        {MOBILE_TABS.map((item) => {
          const Icon = item.icon;
          const active =
            item.href === HUB_NAV.href ? isInHub(pathname) : isActive(pathname, item.href);
          const className = cn(
            'flex h-14 flex-col items-center justify-center gap-1 text-[11px] font-medium',
            'focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]',
            active ? 'text-fg' : 'text-fg-secondary',
          );
          return (
            <li key={item.href} className="flex-1">
              {item.ready ? (
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={className}
                >
                  <Icon size={22} strokeWidth={active ? 2.25 : 1.75} aria-hidden="true" />
                  {item.label}
                </Link>
              ) : (
                <span
                  aria-disabled="true"
                  className={cn(className, 'text-fg-secondary [&_svg]:opacity-50')}
                  title={`${item.label} — เร็ว ๆ นี้`}
                >
                  <Icon size={22} strokeWidth={1.75} aria-hidden="true" />
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
