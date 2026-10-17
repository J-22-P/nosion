import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Card } from '@/components/ui/card';
import { LoginForm } from '@/features/auth/auth-form';
import { DemoButton } from '@/features/auth/demo-button';
import { OAuthButtons, OAuthErrorAlert } from '@/features/auth/oauth-buttons';

export const metadata: Metadata = { title: 'เข้าสู่ระบบ' };

export default function LoginPage() {
  return (
    <div className="space-y-4">
      <Suspense fallback={null}>
        <OAuthErrorAlert />
      </Suspense>
      <Card hero className="p-6 md:p-8">
        <div className="mb-6 space-y-1 text-center">
          <h1 className="text-2xl font-semibold">เข้าสู่ระบบ</h1>
          <p className="text-sm text-fg-secondary">ยินดีต้อนรับกลับ</p>
        </div>
        <OAuthButtons />
        <Divider />
        <LoginForm />
      </Card>
      <Divider />
      <DemoButton variant="secondary" className="w-full" />
    </div>
  );
}

function Divider() {
  return (
    <div className="my-5 flex items-center gap-3 text-xs text-fg-secondary">
      <span className="h-px flex-1 bg-hairline-strong" />
      หรือ
      <span className="h-px flex-1 bg-hairline-strong" />
    </div>
  );
}
