'use client';

import { OAUTH_PROVIDERS, type OAuthProvider } from '@nosion/contracts';
import { Link2 } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import {
  PROVIDER_LABEL,
  useLinkOAuth,
  useOAuthAccounts,
  useOAuthErrorMessage,
  useOAuthProviders,
  useUnlinkOAuth,
} from '@/features/auth/oauth';
import { ProviderIcon } from '@/features/auth/provider-icons';
import { useTranslations } from 'next-intl';

/**
 * บัญชีที่เชื่อม (Phase 8 ขั้น 4b) — เชื่อม/ยกเลิก Google · GitHub
 * กลับมาจากผู้ให้บริการด้วย `?connected=` / `?oauth_error=` → แจ้งผลแล้วล้าง query ทิ้ง (รีเฟรชแล้วไม่แจ้งซ้ำ)
 */
export function ConnectedAccountsCard({ isDemo }: { isDemo: boolean }) {
  const providers = useOAuthProviders();
  const accounts = useOAuthAccounts();
  const link = useLinkOAuth();
  const unlink = useUnlinkOAuth();
  const [privateRepos, setPrivateRepos] = useState(false);
  const t = useTranslations('connected');
  useReturnNotice();

  const enabled = OAUTH_PROVIDERS.filter((p) => providers.data?.[p]);

  return (
    <Card>
      <CardHeader icon={<Link2 />} title={t('title')} description={t('description')} />
      <CardContent>
        {accounts.isPending || providers.isPending ? (
          <Skeleton className="h-14 w-full" />
        ) : enabled.length === 0 ? (
          <p className="text-sm text-fg-secondary">{t('disabled')}</p>
        ) : (
          <ul className="divide-y divide-hairline">
            {enabled.map((provider) => {
              const account = accounts.data?.accounts.find((a) => a.provider === provider);
              const lastWay =
                account && !accounts.data?.hasPassword && accounts.data?.accounts.length === 1;
              const hasRepo = account?.scopes.includes('repo') ?? false;
              return (
                <li key={provider} className="flex flex-wrap items-center gap-3 py-3">
                  <ProviderIcon provider={provider} size={20} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      {PROVIDER_LABEL[provider]}
                      {account ? (
                        <span className="ml-2 font-normal text-fg-secondary">{account.login}</span>
                      ) : null}
                    </p>
                    <p className="text-xs text-fg-secondary">{t(`purpose.${provider}`)}</p>
                    {provider === 'github' && !hasRepo ? (
                      <label className="mt-2 flex items-center gap-2 text-xs">
                        <Checkbox
                          shape="square"
                          size="sm"
                          checked={privateRepos}
                          onCheckedChange={setPrivateRepos}
                          aria-label={t('privateRepos')}
                        />
                        {t('privateReposHint')}
                      </label>
                    ) : null}
                  </div>
                  {account ? <Badge tone="success">{t('connected')}</Badge> : null}
                  {account && hasRepo ? (
                    <Badge tone="outline" mono>
                      repo
                    </Badge>
                  ) : null}
                  {account ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={unlink.isPending || Boolean(lastWay)}
                      title={lastWay ? t('lastWay') : undefined}
                      onClick={() => unlink.mutate(provider)}
                    >
                      {t('disconnect')}
                    </Button>
                  ) : null}
                  {!account || (provider === 'github' && !hasRepo && privateRepos) ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={link.isPending || isDemo}
                      title={isDemo ? t('demo') : undefined}
                      onClick={() =>
                        link.mutate({
                          provider,
                          includePrivateRepos: provider === 'github' && privateRepos,
                        })
                      }
                    >
                      {account
                        ? t('requestRepo')
                        : t('connect', { provider: PROVIDER_LABEL[provider] })}
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function useReturnNotice() {
  const params = useSearchParams();
  const router = useRouter();
  const connected = params.get('connected');
  const error = params.get('oauth_error');
  const t = useTranslations('connected');
  const oauthErrorMessage = useOAuthErrorMessage();
  // แจ้งครั้งเดียวต่อผลลัพธ์ — effect อาจรันซ้ำก่อน router.replace ล้าง query เสร็จ (เคยขึ้น toast ซ้ำ)
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (!connected && !error) return;
    const key = `${connected}|${error}`;
    if (handled.current === key) return;
    handled.current = key;
    if (connected && connected in PROVIDER_LABEL) {
      toast.success(t('done', { provider: PROVIDER_LABEL[connected as OAuthProvider] }));
    }
    const message = oauthErrorMessage(error);
    if (message) toast.error(t('failed'), { description: message });
    router.replace('/settings', { scroll: false });
  }, [connected, error, router, t, oauthErrorMessage]);
}
