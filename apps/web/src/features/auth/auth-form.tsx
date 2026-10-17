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
import { useLocale, useTranslations } from 'next-intl';
import { useApiErrorText, useFieldErrorText } from '@/i18n/errors';

/**
 * schema ตัวเดียวกับที่ backend ใช้ validate (packages/contracts)
 * → เปลี่ยนกฎที่เดียว ทั้งฟอร์มและ API ขยับตาม และ TypeScript ฟ้องทุกจุดที่ตกหล่น
 */
export function LoginForm() {
  const router = useRouter();
  const t = useTranslations('auth');
  const fieldError = useFieldErrorText();
  const onApiError = useApiErrorHandler();
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
      onApiError(error, form.setError);
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <div>
        <Label htmlFor="email">{t('email')}</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          aria-invalid={Boolean(form.formState.errors.email)}
          {...form.register('email')}
        />
        <FieldError>{fieldError(form.formState.errors.email)}</FieldError>
      </div>
      <div>
        <Label htmlFor="password">{t('password')}</Label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          aria-invalid={Boolean(form.formState.errors.password)}
          {...form.register('password')}
        />
        <FieldError>{fieldError(form.formState.errors.password)}</FieldError>
      </div>
      <Button type="submit" size="lg" className="w-full" disabled={form.formState.isSubmitting}>
        {form.formState.isSubmitting ? t('signingIn') : t('signIn')}
      </Button>
      <p className="text-center text-sm text-fg-secondary">
        {t('noAccount')}{' '}
        <Link href="/register" className="font-medium text-accent hover:underline">
          {t('signUpLink')}
        </Link>
      </p>
    </form>
  );
}

export function RegisterForm() {
  const router = useRouter();
  const locale = useLocale() as 'th' | 'en';
  const t = useTranslations('auth');
  const fieldError = useFieldErrorText();
  const onApiError = useApiErrorHandler();
  const setSession = useAuthStore((s) => s.setSession);
  const form = useForm<RegisterFormValues, unknown, RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      email: '',
      password: '',
      displayName: '',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Bangkok',
      locale,
    },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const res = await authApi.register(values);
      setSession(res.accessToken, res.user);
      toast.success(t('registered'), { description: t('verifySent') });
      router.push('/tasks');
    } catch (error) {
      onApiError(error, form.setError);
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <div>
        <Label htmlFor="displayName">{t('displayName')}</Label>
        <Input
          id="displayName"
          autoComplete="name"
          aria-invalid={Boolean(form.formState.errors.displayName)}
          {...form.register('displayName')}
        />
        <FieldError>{fieldError(form.formState.errors.displayName)}</FieldError>
      </div>
      <div>
        <Label htmlFor="email">{t('email')}</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          aria-invalid={Boolean(form.formState.errors.email)}
          {...form.register('email')}
        />
        <FieldError>{fieldError(form.formState.errors.email)}</FieldError>
      </div>
      <div>
        <Label htmlFor="password">{t('password')}</Label>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          aria-invalid={Boolean(form.formState.errors.password)}
          {...form.register('password')}
        />
        <FieldError>{fieldError(form.formState.errors.password)}</FieldError>
        <p className="mt-1.5 text-xs text-fg-secondary">{t('passwordHint')}</p>
      </div>
      <Button type="submit" size="lg" className="w-full" disabled={form.formState.isSubmitting}>
        {form.formState.isSubmitting ? t('signingUp') : t('signUp')}
      </Button>
      <p className="text-center text-sm text-fg-secondary">
        {t('haveAccount')}{' '}
        <Link href="/login" className="font-medium text-accent hover:underline">
          {t('signIn')}
        </Link>
      </p>
    </form>
  );
}

/** error ราย field จาก RFC 9457 → ผูกกลับเข้าฟอร์มให้ตรงช่อง · ไม่มี field = toast */
function useApiErrorHandler() {
  const t = useTranslations('errors');
  const apiErrorText = useApiErrorText();
  return <T extends FieldValues>(error: unknown, setError: UseFormSetError<T>): void => {
    if (!(error instanceof ApiError)) {
      toast.error(t('generic'), { description: t('tryAgain') });
      return;
    }
    const entries = Object.entries(error.fieldErrors());
    if (entries.length === 0) {
      toast.error(t('generic'), { description: apiErrorText(error) });
      return;
    }
    for (const [path, message] of entries) {
      setError(path as Path<T>, { type: 'server', message });
    }
  };
}
