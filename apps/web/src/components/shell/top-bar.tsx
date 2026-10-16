'use client';

import { Bell, Search } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { StatusPill } from '@/components/ui/status-pill';
import { useUIStore } from '@/lib/stores/ui-store';
import { useConnection } from '@/features/sync/use-sync';
import { LogoMark } from './logo';
import { Avatar, ProfileMenu } from './profile-menu';
import { currentNav } from './nav';

/** ช่องค้นหาบน top bar และปุ่มแว่นขยายบนมือถือเปิด command palette (สเปก 8.3) */
function openCommandPalette() {
  useUIStore.getState().setPaletteOpen(true);
}

/**
 * Top bar desktop/tablet (8.2) — sticky, glass
 * ช่องค้นหาคือ "ปุ่ม" เปิด ⌘K ไม่ใช่ input · Connection pill · กระดิ่ง · โปรไฟล์
 */
export function TopBar({ displayName, isDemo }: { displayName: string; isDemo: boolean }) {
  const connection = useConnection();

  return (
    <header className="glass sticky top-0 z-20 hidden h-16 items-center gap-4 border-b border-hairline px-6 md:flex lg:px-10">
      <button
        type="button"
        onClick={openCommandPalette}
        aria-haspopup="dialog"
        className="flex h-10 w-full max-w-md items-center gap-3 rounded-control border border-hairline bg-wash px-3.5 text-left text-sm text-fg-secondary transition-colors hover:bg-wash-active focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
      >
        <Search size={16} aria-hidden="true" />
        <span className="flex-1 truncate">ค้นหาหรือสั่งการ…</span>
        <Kbd>⌘K</Kbd>
      </button>

      <div className="ml-auto flex items-center gap-2">
        <StatusPill
          status={connection.status}
          label={connection.label}
          className="hidden lg:inline-flex"
        />
        <Button variant="ghost" size="icon" shape="circle" aria-label="การแจ้งเตือน">
          <Bell size={18} strokeWidth={1.75} />
        </Button>
        <ProfileMenu displayName={displayName} isDemo={isDemo} />
      </div>
    </header>
  );
}

/**
 * Header มือถือ (8.2): โลโก้ + ชื่อหน้าย่อย · ค้นหา · กระดิ่ง · โปรไฟล์ (ไปหน้า hub)
 */
export function MobileHeader({ pathname, displayName }: { pathname: string; displayName: string }) {
  const connection = useConnection();
  const nav = currentNav(pathname);

  return (
    <header className="glass sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-hairline px-4 pt-[env(safe-area-inset-top)] md:hidden">
      <LogoMark size={28} />
      <div className="min-w-0 flex-1 leading-tight">
        <p className="text-sm font-semibold" lang="en">
          NOSION
        </p>
        <p className="truncate text-xs text-fg-secondary" lang="en">
          {nav?.en ?? ''}
          {connection.status === 'offline' ? (
            <span className="text-danger"> · {connection.label}</span>
          ) : connection.status === 'syncing' ? (
            <span className="text-accent"> · {connection.label}</span>
          ) : null}
        </p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        shape="circle"
        aria-label="ค้นหา"
        onClick={openCommandPalette}
      >
        <Search size={18} strokeWidth={1.75} />
      </Button>
      <Button variant="ghost" size="icon" shape="circle" aria-label="การแจ้งเตือน">
        <Bell size={18} strokeWidth={1.75} />
      </Button>
      <Link
        href="/hub"
        aria-label={`บัญชีของ ${displayName}`}
        className="rounded-full focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
      >
        <Avatar name={displayName} />
      </Link>
    </header>
  );
}
