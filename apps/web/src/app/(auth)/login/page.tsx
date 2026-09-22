import type { Metadata } from 'next';
import { LoginForm } from '@/features/auth/auth-form';

export const metadata: Metadata = { title: 'เข้าสู่ระบบ' };

export default function LoginPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">เข้าสู่ระบบ</h1>
      <LoginForm />
    </div>
  );
}
