'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, BellOff, Send } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { pushApi } from './push';
import { usePushStatus, useTogglePush } from './use-push';
import { errorText } from '@/i18n/errors';
import { useTranslations } from 'next-intl';
import { dateFormat } from '@/i18n/current';

/** การแจ้งเตือนในหน้า Settings (สเปก 10.3) — สถานะเป็นของ "เครื่องนี้" ไม่ใช่ของบัญชี */
export function NotificationsCard() {
  const status = usePushStatus();
  const toggle = useTogglePush();
  const state = status.data?.state;
  const queryClient = useQueryClient();
  const t = useTranslations('push');
  const test = useMutation({
    mutationFn: pushApi.test,
    onSuccess: ({ fireAt }) => {
      const time = dateFormat({ timeStyle: 'short' }).format(new Date(fireAt));
      toast.success(t('testScheduled', { time }), { description: t('testDetail') });
      void queryClient.invalidateQueries({ queryKey: ['entries'] });
    },
    onError: (error) =>
      toast.error(t('testFailed'), {
        description: errorText(error),
      }),
  });

  const aside = status.isPending ? (
    <Skeleton className="h-9 w-28" />
  ) : state === 'on' ? (
    <div className="flex flex-wrap justify-end gap-2">
      <Button variant="secondary" onClick={() => test.mutate()} disabled={test.isPending}>
        <Send size={16} aria-hidden="true" /> {t('sendTest')}
      </Button>
      <Button
        variant="secondary"
        onClick={() => toggle.mutate({ enable: false })}
        disabled={toggle.isPending}
      >
        <BellOff size={16} aria-hidden="true" /> {t('turnOff')}
      </Button>
    </div>
  ) : state === 'off' && status.data?.publicKey ? (
    <Button
      onClick={() => toggle.mutate({ enable: true, publicKey: status.data.publicKey! })}
      disabled={toggle.isPending}
    >
      <Bell size={16} aria-hidden="true" /> {toggle.isPending ? t('turningOn') : t('turnOn')}
    </Button>
  ) : null;

  return (
    <Card>
      <CardHeader
        title={t('title')}
        description={
          status.isError ? t('statusFailed') : state ? t(`state.${state}`) : t('checking')
        }
        aside={aside}
      />
    </Card>
  );
}
