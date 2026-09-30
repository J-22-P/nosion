'use client';

import { useSession } from '@/features/auth/use-session';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ThemeSwitcher } from '@/components/shared/theme-switcher';

export default function SettingsPage() {
  const { user, settings } = useSession();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">ตั้งค่า</h1>
      <Card>
        <CardHeader>
          <CardTitle>โปรไฟล์</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-fg-secondary">ชื่อที่ใช้แสดง</dt>
              <dd>{user?.displayName ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-fg-secondary">อีเมล</dt>
              <dd className="break-all">{user?.email ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-fg-secondary">โซนเวลา</dt>
              <dd>{settings?.timezone ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-fg-secondary">โมดูลที่เปิดใช้</dt>
              <dd>{settings?.enabledModules?.join(', ') ?? '—'}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>
      <Card>
        <CardHeader
          title="การแสดงผล"
          description="ตามระบบ = เปลี่ยนตามการตั้งค่าสว่าง/มืดของอุปกรณ์"
          aside={<ThemeSwitcher />}
        />
      </Card>
    </div>
  );
}
