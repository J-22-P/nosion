import type { Metadata } from 'next';
import { Card } from '@/components/ui/card';
import { RegisterForm } from '@/features/auth/auth-form';

export const metadata: Metadata = { title: 'สมัครสมาชิก' };

export default function RegisterPage() {
  return (
    <Card hero className="p-6 md:p-8">
      <div className="mb-6 space-y-1 text-center">
        <h1 className="text-2xl font-semibold">สร้างบัญชีใหม่</h1>
        <p className="text-sm text-fg-secondary">งาน การเงิน ออกกำลังกาย และนิสัย ในที่เดียว</p>
      </div>
      <RegisterForm />
    </Card>
  );
}
