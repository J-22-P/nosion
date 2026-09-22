'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  loginSchema,
  registerSchema,
  type LoginFormValues,
  type LoginInput,
  type RegisterFormValues,
  type RegisterInput,
} from '@nosion/contracts';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm, type FieldValues, type Path, type UseFormSetError } from 'react-hook-form';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { FieldError, Input, Label } from '@/components/ui/input';
import { ApiError } from '@/lib/api-client';
import { authApi } from './api';
import { useAuthStore } from './auth-store';

/**
 * schema ตัวเดียวกับที่ backend ใช้ validate (packages/contracts)
 * → เปลี่ยนกฎที่เดียว ทั้งฟอร์มและ API ขยับตาม และ TypeScript ฟ้องทุกจุดที่ตกหล่น
 */
export function LoginForm() {
  const router = useRouter();
  const setSession = useAuthStore((s) => s.setSession);
  const form = useForm<LoginFormValues, unknown, LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const res = await authApi.login(values);
      setSession(res.accessToken, res.user);
      router.push('/tasks');
    } catch (error) {
      handleApiError(error, form.setError);
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div>
        <Label htmlFor="email">อีเมล</Label>
        <Input id="email" type="email" autoComplete="email" {...form.register('email')} />
        <FieldError>{form.formState.errors.email?.message}</FieldError>
      </div>
      <div>
        <Label htmlFor="password">รหัสผ่าน</Label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          {...form.register('password')}
        />
        <FieldError>{form.formState.errors.password?.message}</FieldError>
      </div>
      <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
        {form.formState.isSubmitting ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}
      </Button>
      <p className="text-center text-sm text-[var(--muted-foreground)]">
        ยังไม่มีบัญชี?{' '}
        <Link href="/register" className="underline">
          สมัครใหม่
        </Link>
      </p>
    </form>
  );
}

export function RegisterForm() {
  const router = useRouter();
  const setSession = useAuthStore((s) => s.setSession);
  const form = useForm<RegisterFormValues, unknown, RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      email: '',
      password: '',
      displayName: '',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Bangkok',
    },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const res = await authApi.register(values);
      setSession(res.accessToken, res.user);
      toast.success('สมัครเรียบร้อย', { description: 'เราส่งอีเมลยืนยันให้แล้ว' });
      router.push('/tasks');
    } catch (error) {
      handleApiError(error, form.setError);
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div>
        <Label htmlFor="displayName">ชื่อที่ใช้แสดง</Label>
        <Input id="displayName" autoComplete="name" {...form.register('displayName')} />
        <FieldError>{form.formState.errors.displayName?.message}</FieldError>
      </div>
      <div>
        <Label htmlFor="email">อีเมล</Label>
        <Input id="email" type="email" autoComplete="email" {...form.register('email')} />
        <FieldError>{form.formState.errors.email?.message}</FieldError>
      </div>
      <div>
        <Label htmlFor="password">รหัสผ่าน</Label>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          {...form.register('password')}
        />
        <FieldError>{form.formState.errors.password?.message}</FieldError>
        <p className="mt-1 text-xs text-[var(--muted-foreground)]">
          อย่างน้อย 12 ตัวอักษร และต้องไม่เคยปรากฏในข้อมูลที่รั่วไหล
        </p>
      </div>
      <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
        {form.formState.isSubmitting ? 'กำลังสมัคร…' : 'สมัครสมาชิก'}
      </Button>
      <p className="text-center text-sm text-[var(--muted-foreground)]">
        มีบัญชีแล้ว?{' '}
        <Link href="/login" className="underline">
          เข้าสู่ระบบ
        </Link>
      </p>
    </form>
  );
}

/** error ราย field จาก RFC 9457 → ผูกกลับเข้าฟอร์มให้ตรงช่อง */
function handleApiError<T extends FieldValues>(error: unknown, setError: UseFormSetError<T>): void {
  if (!(error instanceof ApiError)) {
    toast.error('เกิดข้อผิดพลาด', { description: 'กรุณาลองใหม่อีกครั้ง' });
    return;
  }
  const fields = error.fieldErrors();
  const entries = Object.entries(fields);
  if (entries.length === 0) {
    toast.error(error.problem.title, { description: error.message });
    return;
  }
  for (const [path, message] of entries) {
    setError(path as Path<T>, { type: 'server', message });
  }
}
