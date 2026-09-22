import type { Metadata } from 'next';
import { RegisterForm } from '@/features/auth/auth-form';

export const metadata: Metadata = { title: 'สมัครสมาชิก' };

export default function RegisterPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">สร้างบัญชีใหม่</h1>
      <RegisterForm />
    </div>
  );
}
