'use client';

import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@nosion/ui';
import { StatusPill } from '@/components/ui/status-pill';
import { useUIStore } from '@/lib/stores/ui-store';
import { useOnlineStatus } from '@/lib/use-online-status';
import { LogoMark } from './logo';
import { PRIMARY_NAV, SETTINGS_NAV, isActive, type NavItem } from './nav';

const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? 'dev';

/**
 * Sidebar "Workspace OS" (8.2)
 * - ≥ 1024px: 260px (ยุบเป็น rail ได้ด้วยปุ่มหรือ `[`)
 * - 768–1023px: icon rail 72px เสมอ
 * - < 768px: ซ่อน (ใช้ bottom tab bar แทน)
 * ชื่อเมนูใน rail เป็น sr-only → ชื่อที่ screen reader อ่านยังครบ
 */
export function Sidebar({ pathname }: { pathname: string }) {
  const collapsed = useUIStore((s) => s.sidebarCollapsed);
  const toggle = useUIStore((s) => s.toggleSidebar);
  const online = useOnlineStatus();
  const expanded = !collapsed;

  return (
    <aside
      className={cn(
        'sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-hairline bg-canvas md:flex',
        'w-[72px] transition-[width] duration-[180ms] ease-standard',
        expanded && 'lg:w-[260px]',
      )}
    >
      <div className={cn('flex h-16 items-center gap-3 px-5', expanded && 'lg:px-5')}>
        <Link href="/today" aria-label="NOSION หน้าแรก" className="rounded-control">
          <LogoMark size={32} />
        </Link>
        <div className={cn('hidden min-w-0 leading-tight', expanded && 'lg:block')}>
          <p className="text-[15px] font-semibold" lang="en">
            NOSION
          </p>
          <p className="text-xs text-fg-secondary" lang="en">
            Workspace OS
          </p>
        </div>
      </div>

      <nav aria-label="เมนูหลัก" className="flex-1 overflow-y-auto px-3 py-2">
        <ul className="space-y-0.5">
          {PRIMARY_NAV.map((item) => (
            <li key={item.href}>
              <SidebarLink item={item} active={isActive(pathname, item.href)} expanded={expanded} />
            </li>
          ))}
        </ul>
      </nav>

      <div className="space-y-2 border-t border-hairline px-3 py-3">
        <SidebarLink
          item={SETTINGS_NAV}
          active={isActive(pathname, SETTINGS_NAV.href)}
          expanded={expanded}
        />
        <div className={cn('hidden px-2', expanded && 'lg:block')}>
          <StatusPill
            status={online ? 'online' : 'offline'}
            label={online ? `Sync · v${APP_VERSION}` : 'ออฟไลน์'}
          />
        </div>
        <button
          type="button"
          onClick={toggle}
          aria-label={expanded ? 'ยุบแถบด้านข้าง ([)' : 'ขยายแถบด้านข้าง ([)'}
          aria-expanded={expanded}
          className="hidden size-10 items-center justify-center rounded-control text-fg-secondary transition-colors hover:bg-wash hover:text-fg focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] lg:flex"
        >
          {expanded ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
        </button>
      </div>
    </aside>
  );
}

function SidebarLink({
  item,
  active,
  expanded,
}: {
  item: NavItem;
  active: boolean;
  expanded: boolean;
}) {
  const Icon = item.icon;
  const base = cn(
    'flex h-10 items-center gap-3 rounded-control px-3 text-sm transition-colors duration-[180ms]',
    'focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]',
    expanded ? 'justify-center lg:justify-start' : 'justify-center',
  );
  const text = (
    <span className={cn('sr-only', expanded && 'lg:not-sr-only lg:truncate')}>
      {item.label}{' '}
      <span className="text-fg-secondary" lang="en">
        ({item.en})
      </span>
    </span>
  );

  if (!item.ready) {
    return (
      <span
        aria-disabled="true"
        title={`${item.label} — เร็ว ๆ นี้`}
        // ไม่ใช้ text-tertiary: contrast ต่ำกว่า AA · บอกสถานะด้วยป้าย "เร็ว ๆ นี้" + ไอคอนจาง
        className={cn(base, 'cursor-not-allowed text-fg-secondary [&_svg]:opacity-50')}
      >
        <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
        {text}
        <span className={cn('sr-only', expanded && 'lg:not-sr-only lg:ml-auto lg:text-[10px]')}>
          เร็ว ๆ นี้
        </span>
      </span>
    );
  }

  return (
    <Link
      href={item.href}
      title={item.label}
      aria-current={active ? 'page' : undefined}
      className={cn(
        base,
        active
          ? 'bg-surface font-medium text-fg shadow-card dark:bg-sunken'
          : 'text-fg-secondary hover:bg-wash hover:text-fg',
      )}
    >
      <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
      {text}
    </Link>
  );
}
