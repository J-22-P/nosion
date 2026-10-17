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

const when = new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' });

/**
 * GitHub → งาน/ปฏิทิน (Phase 8 ขั้น 5)
 *  • ดึง issue/PR ที่ได้รับมอบหมาย — วันจาก milestone ขึ้นปฏิทิน · ดึงเองทุกชั่วโมง + ปุ่มดึงตอนนี้
 *  • webhook (ไม่บังคับ) — เปลี่ยนบน GitHub แล้วเห็นทันที + PR merged ปิดงานที่อ้างถึง
 */
export function GitHubCard() {
  const status = useGitHubIntegration();
  const sync = useGitHubSync();
  const providers = useOAuthProviders();

  return (
    <Card>
      <CardHeader
        icon={<Github />}
        title="GitHub → งานและปฏิทิน"
        description="ดึง issue และ PR ที่มอบหมายให้คุณมาเป็นงาน · issue ที่อยู่ใน milestone ขึ้นปฏิทินตามวันกำหนด"
      />
      <CardContent className="space-y-5">
        {status.isPending ? (
          <Skeleton className="h-16 w-full" />
        ) : status.isError ? (
          <p role="alert" className="text-sm text-danger">
            โหลดสถานะ GitHub ไม่สำเร็จ
          </p>
        ) : !status.data.connected ? (
          <p className="text-sm text-fg-secondary">
            {providers.data?.github === false
              ? 'เซิร์ฟเวอร์นี้ยังไม่ได้เปิดการเชื่อม GitHub'
              : 'เชื่อม GitHub ในการ์ด “บัญชีที่เชื่อม” ด้านบนก่อน — เชื่อมแล้วดึงงานให้ทันที'}
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm">
                <p>
                  เชื่อมกับ <span className="font-medium">{status.data.login}</span>
                  {status.data.privateRepos ? ' · รวม repo ส่วนตัว' : ' · เฉพาะ repo สาธารณะ'}
                </p>
                <p className="text-xs text-fg-secondary">
                  {status.data.lastSyncAt
                    ? `ดึงล่าสุด ${when.format(new Date(status.data.lastSyncAt))}`
                    : 'ยังไม่เคยดึง'}
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
                {sync.isPending ? 'กำลังดึง…' : 'ดึงงานตอนนี้'}
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

  return (
    <section aria-labelledby="gh-webhook-title" className="space-y-3 border-t border-hairline pt-4">
      <div>
        <h3 id="gh-webhook-title" className="text-sm font-medium">
          Webhook (ไม่บังคับ)
        </h3>
        <p className="text-xs text-fg-secondary">
          ให้ GitHub แจ้งทันทีเมื่อ issue เปลี่ยน · PR ที่ merge แล้วปิดงานที่อ้างถึงด้วย{' '}
          <code className="font-mono">nosion:&lt;รหัสงาน&gt;</code> (เมนู ⋯ ของงาน →
          คัดลอกรหัสอ้างอิง)
        </p>
      </div>

      {created ? (
        <div
          role="status"
          className="space-y-3 rounded-row border border-hairline-strong bg-sunken p-4"
        >
          <p className="text-sm font-medium">
            ใส่ใน repo → Settings → Webhooks → Add webhook · Content type{' '}
            <code className="font-mono">application/json</code> · เลือก event{' '}
            <span lang="en">Issues</span> และ <span lang="en">Pull requests</span>
          </p>
          <CopyField label="Payload URL" value={created.url} />
          <CopyField label="Secret (แสดงครั้งเดียว)" value={created.secret} />
          <Button variant="ghost" size="sm" onClick={() => setCreated(null)}>
            ใส่แล้ว ปิด
          </Button>
        </div>
      ) : configured && url ? (
        <div className="space-y-2">
          <CopyField label="Payload URL" value={url} />
          <p className="text-xs text-fg-secondary">
            {lastDeliveryAt
              ? `GitHub ส่งมาล่าสุด ${when.format(new Date(lastDeliveryAt))}`
              : 'ยังไม่เคยได้รับ event จาก GitHub'}
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
          {configured ? 'สร้าง secret ใหม่' : 'เปิด webhook'}
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
            ปิด webhook
          </Button>
        ) : null}
      </div>
    </section>
  );
}

function CopyField({ label, value }: { label: string; value: string }) {
  async function copy() {
    if (await copyText(value)) toast.success(`คัดลอก ${label} แล้ว`);
    else toast.error('คัดลอกไม่ได้ — เลือกข้อความในช่องแล้วคัดลอกเอง');
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
      <Button variant="secondary" onClick={copy} className="gap-1.5" aria-label={`คัดลอก ${label}`}>
        <Copy size={14} aria-hidden="true" /> คัดลอก
      </Button>
    </div>
  );
}
