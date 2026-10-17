'use client';

import type { GitHubWebhookSecretDto } from '@nosion/contracts';
import { Copy, Github, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useOAuthProviders } from '@/features/auth/oauth';
import { copyText } from '@/features/today/use-today';
import {
  useDisableGitHubWebhook,
  useGitHubIntegration,
  useGitHubSync,
  useRotateGitHubWebhook,
} from './github';
import { useTranslations } from 'next-intl';
import { dateFormat } from '@/i18n/current';

const when = (iso: string) =>
  dateFormat({ dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));

/**
 * GitHub → งาน/ปฏิทิน (Phase 8 ขั้น 5)
 *  • ดึง issue/PR ที่ได้รับมอบหมาย — วันจาก milestone ขึ้นปฏิทิน · ดึงเองทุกชั่วโมง + ปุ่มดึงตอนนี้
 *  • webhook (ไม่บังคับ) — เปลี่ยนบน GitHub แล้วเห็นทันที + PR merged ปิดงานที่อ้างถึง
 */
export function GitHubCard() {
  const status = useGitHubIntegration();
  const sync = useGitHubSync();
  const providers = useOAuthProviders();
  const t = useTranslations('github');

  return (
    <Card>
      <CardHeader icon={<Github />} title={t('title')} description={t('description')} />
      <CardContent className="space-y-5">
        {status.isPending ? (
          <Skeleton className="h-16 w-full" />
        ) : status.isError ? (
          <p role="alert" className="text-sm text-danger">
            {t('loadFailed')}
          </p>
        ) : !status.data.connected ? (
          <p className="text-sm text-fg-secondary">
            {providers.data?.github === false ? t('serverDisabled') : t('connectFirst')}
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm">
                <p>
                  {t.rich('connectedAs', {
                    login: status.data.login ?? '',
                    scope: status.data.privateRepos ? t('scope.private') : t('scope.public'),
                    b: (chunks) => <span className="font-medium">{chunks}</span>,
                  })}
                </p>
                <p className="text-xs text-fg-secondary">
                  {status.data.lastSyncAt
                    ? t('lastSync', { when: when(status.data.lastSyncAt) })
                    : t('neverSynced')}
                </p>
                {status.data.lastSyncError ? (
                  <p role="alert" className="mt-1 text-xs text-danger">
                    {status.data.lastSyncError}
                  </p>
                ) : null}
              </div>
              <Button
                variant="secondary"
                size="sm"
                className="gap-1.5"
                disabled={sync.isPending}
                onClick={() => sync.mutate()}
              >
                <RefreshCw
                  size={14}
                  aria-hidden="true"
                  className={sync.isPending ? 'animate-spin' : undefined}
                />
                {sync.isPending ? t('syncing') : t('syncNow')}
              </Button>
            </div>
            <WebhookSection
              configured={status.data.webhook.configured}
              url={status.data.webhook.url}
              lastDeliveryAt={status.data.webhook.lastDeliveryAt}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}

function WebhookSection({
  configured,
  url,
  lastDeliveryAt,
}: {
  configured: boolean;
  url: string | null;
  lastDeliveryAt: string | null;
}) {
  const rotate = useRotateGitHubWebhook();
  const disable = useDisableGitHubWebhook();
  const [created, setCreated] = useState<GitHubWebhookSecretDto | null>(null);
  const t = useTranslations('github');
  const code = (chunks: React.ReactNode) => <code className="font-mono">{chunks}</code>;

  return (
    <section aria-labelledby="gh-webhook-title" className="space-y-3 border-t border-hairline pt-4">
      <div>
        <h3 id="gh-webhook-title" className="text-sm font-medium">
          {t('webhook')}
        </h3>
        <p className="text-xs text-fg-secondary">{t.rich('webhookHint', { code })}</p>
      </div>

      {created ? (
        <div
          role="status"
          className="space-y-3 rounded-row border border-hairline-strong bg-sunken p-4"
        >
          <p className="text-sm font-medium">{t.rich('webhookSteps', { code })}</p>
          <CopyField label={t('payloadUrl')} value={created.url} />
          <CopyField label={t('secretOnce')} value={created.secret} />
          <Button variant="ghost" size="sm" onClick={() => setCreated(null)}>
            {t('done')}
          </Button>
        </div>
      ) : configured && url ? (
        <div className="space-y-2">
          <CopyField label={t('payloadUrl')} value={url} />
          <p className="text-xs text-fg-secondary">
            {lastDeliveryAt ? t('lastDelivery', { when: when(lastDeliveryAt) }) : t('noDelivery')}
          </p>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={rotate.isPending}
          onClick={() => rotate.mutate(undefined, { onSuccess: setCreated })}
        >
          {configured ? t('rotate') : t('enable')}
        </Button>
        {configured ? (
          <Button
            variant="ghost"
            size="sm"
            disabled={disable.isPending}
            onClick={() => {
              setCreated(null);
              disable.mutate();
            }}
          >
            {t('disable')}
          </Button>
        ) : null}
      </div>
    </section>
  );
}

function CopyField({ label, value }: { label: string; value: string }) {
  const t = useTranslations('github');
  async function copy() {
    if (await copyText(value)) toast.success(t('copied', { label }));
    else toast.error(t('copyFailed'));
  }
  return (
    <div className="flex gap-2">
      <Input
        readOnly
        value={value}
        aria-label={label}
        className="font-mono text-xs"
        onFocus={(e) => e.currentTarget.select()}
      />
      <Button
        variant="secondary"
        onClick={copy}
        className="gap-1.5"
        aria-label={t('copyLabel', { label })}
      >
        <Copy size={14} aria-hidden="true" /> {t('copy')}
      </Button>
    </div>
  );
}
