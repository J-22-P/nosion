'use client';

import { ChevronRight, LogOut } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@nosion/ui';
import { ThemeSwitcher } from '@/components/shared/theme-switcher';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader } from '@/components/ui/card';
import { useSession } from '@/features/auth/use-session';
import { HUB_ITEMS } from './nav';
import { Avatar, useLogout } from './profile-menu';

/**
 * หน้า hub "สรุป" (8.2) — รวมโมดูลที่เปิดน้อยกว่า (Workouts, Habits, Review, Settings)
 * เป็นแท็บที่ 5 ของ bottom tab bar บนมือถือ · บน desktop เข้าได้จาก URL แต่ไม่อยู่ใน sidebar
 */
export function HubView() {
  const { user } = useSession();
  const logout = useLogout();
  const name = user?.displayName ?? '';

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-[30px] font-semibold leading-tight md:text-[40px]">สรุป</h1>

      <Card>
        <CardHeader
          icon={<Avatar name={name} className="size-10" />}
          title={name}
          description={user?.email}
          aside={user?.isDemo ? <Badge tone="accent">บัญชีทดลอง</Badge> : null}
        />
      </Card>

      <Card className="p-2">
        <ul>
          {HUB_ITEMS.map((item) => {
            const Icon = item.icon;
            const inner = (
              <>
                <span className="flex size-10 items-center justify-center rounded-control bg-sunken">
                  <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
                </span>
                <span className="flex-1">
                  <span className="block text-sm font-medium">{item.label}</span>
                  <span className="block text-xs text-fg-secondary" lang="en">
                    {item.en}
                  </span>
                </span>
                {item.ready ? (
                  <ChevronRight size={18} className="text-fg-tertiary" aria-hidden="true" />
                ) : (
                  <Badge tone="outline">เร็ว ๆ นี้</Badge>
                )}
              </>
            );
            const rowClass = 'flex items-center gap-3 rounded-row p-3';
            return (
              <li key={item.href}>
                {item.ready ? (
                  <Link
                    href={item.href}
                    className={cn(
                      rowClass,
                      'transition-colors hover:bg-wash focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]',
                    )}
                  >
                    {inner}
                  </Link>
                ) : (
                  <div aria-disabled="true" className={cn(rowClass, 'opacity-60')}>
                    {inner}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </Card>

      <Card>
        <CardHeader title="ธีม" aside={<ThemeSwitcher compact />} />
      </Card>

      <button
        type="button"
        onClick={() => void logout()}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-card border border-hairline bg-surface text-sm font-medium text-danger transition-colors hover:bg-danger-soft focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
      >
        <LogOut size={16} aria-hidden="true" /> ออกจากระบบ
      </button>
    </div>
  );
}
