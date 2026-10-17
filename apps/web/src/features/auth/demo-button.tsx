'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button, type ButtonProps } from '@/components/ui/button';
import { authApi } from './api';
import { useAuthStore } from './auth-store';
import { useTranslations } from 'next-intl';
import { useApiErrorText } from '@/i18n/errors';

/** เข้าใช้ได้ใน 1 คลิกโดยไม่ต้องสมัคร — จุดที่ทำให้คนกดดูจริงแทนที่จะปิดหน้าไป */
export function DemoButton({
  variant = 'primary',
  className,
}: Pick<ButtonProps, 'variant' | 'className'> = {}) {
  const router = useRouter();
  const setSession = useAuthStore((s) => s.setSession);
  const [pending, setPending] = useState(false);
  const t = useTranslations('auth');
  const apiErrorText = useApiErrorText();

  async function start() {
    setPending(true);
    try {
      const res = await authApi.demo();
      setSession(res.accessToken, res.user);
      router.push('/tasks');
    } catch (error) {
      toast.error(t('demoFailed'), {
        description: apiErrorText(error) ?? t('demoRetryLater'),
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <Button size="lg" variant={variant} className={className} onClick={start} disabled={pending}>
      {pending ? t('demoPreparing') : t('demoStart')}
    </Button>
  );
}
