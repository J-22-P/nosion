'use client';

import { OAUTH_PROVIDERS, type OAuthProvider } from '@nosion/contracts';
import { Link2 } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import {
  oauthErrorMessage,
  PROVIDER_LABEL,
  useLinkOAuth,
  useOAuthAccounts,
  useOAuthProviders,
  useUnlinkOAuth,
} from '@/features/auth/oauth';
import { ProviderIcon } from '@/features/auth/provider-icons';

const PURPOSE: Record<OAuthProvider, string> = {
  google: 'เข้าสู่ระบบด้วยบัญชี Google',
  github: 'เข้าสู่ระบบ + ดึง issue ที่ได้รับมอบหมายลงปฏิทิน',
};

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
  useReturnNotice();

  const enabled = OAUTH_PROVIDERS.filter((p) => providers.data?.[p]);

  return (
    <Card>
      <CardHeader
        icon={<Link2 />}
        title="บัญชีที่เชื่อม"
        description="เข้าสู่ระบบด้วยบัญชีอื่นแทนรหัสผ่าน"
      />
      <CardContent>
        {accounts.isPending || providers.isPending ? (
          <Skeleton className="h-14 w-full" />
        ) : enabled.length === 0 ? (
          <p className="text-sm text-fg-secondary">เซิร์ฟเวอร์นี้ยังไม่ได้เปิดการเชื่อมบัญชี</p>
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
                    <p className="text-xs text-fg-secondary">{PURPOSE[provider]}</p>
                    {provider === 'github' && !hasRepo ? (
                      <label className="mt-2 flex items-center gap-2 text-xs">
                        <Checkbox
                          shape="square"
                          size="sm"
                          checked={privateRepos}
                          onCheckedChange={setPrivateRepos}
                          aria-label="รวม repo ส่วนตัว"
                        />
                        รวม repo ส่วนตัว (GitHub ขอสิทธิ์ repo เต็ม — ไม่มีแบบอ่านอย่างเดียว)
                      </label>
                    ) : null}
                  </div>
                  {account ? <Badge tone="success">เชื่อมแล้ว</Badge> : null}
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
                      title={lastWay ? 'ทางเข้าระบบทางเดียว — ตั้งรหัสผ่านก่อน' : undefined}
                      onClick={() => unlink.mutate(provider)}
                    >
                      ยกเลิกการเชื่อม
                    </Button>
                  ) : null}
                  {!account || (provider === 'github' && !hasRepo && privateRepos) ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={link.isPending || isDemo}
                      title={isDemo ? 'บัญชีทดลองเชื่อมบัญชีภายนอกไม่ได้' : undefined}
                      onClick={() =>
                        link.mutate({
                          provider,
                          includePrivateRepos: provider === 'github' && privateRepos,
                        })
                      }
                    >
                      {account ? 'ขอสิทธิ์ repo ส่วนตัว' : `เชื่อม ${PROVIDER_LABEL[provider]}`}
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

  useEffect(() => {
    if (!connected && !error) return;
    if (connected && connected in PROVIDER_LABEL) {
      toast.success(`เชื่อม ${PROVIDER_LABEL[connected as OAuthProvider]} แล้ว`);
    }
    const message = oauthErrorMessage(error);
    if (message) toast.error('เชื่อมบัญชีไม่สำเร็จ', { description: message });
    router.replace('/settings', { scroll: false });
  }, [connected, error, router]);
}
