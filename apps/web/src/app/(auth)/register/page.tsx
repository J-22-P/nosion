import type { Metadata } from 'next';
import { Card } from '@/components/ui/card';
import { RegisterForm } from '@/features/auth/auth-form';
import { OAuthButtons } from '@/features/auth/oauth-buttons';

export const metadata: Metadata = { title: 'สมัครสมาชิก' };

export default function RegisterPage() {
  return (
    <Card hero className="p-6 md:p-8">
      <div className="mb-6 space-y-1 text-center">
        <h1 className="text-2xl font-semibold">สร้างบัญชีใหม่</h1>
        <p className="text-sm text-fg-secondary">งาน การเงิน ออกกำลังกาย และนิสัย ในที่เดียว</p>
      </div>
      <OAuthButtons />
      <div className="my-5 flex items-center gap-3 text-xs text-fg-secondary">
        <span className="h-px flex-1 bg-hairline-strong" />
        หรือสมัครด้วยอีเมล
        <span className="h-px flex-1 bg-hairline-strong" />
      </div>
      <RegisterForm />
    </Card>
  );
}
