'use client';

import type { ApiKeyScope, CreatedApiKeyDto } from '@nosion/contracts';
import { Copy, KeyRound, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input, Label, Select } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { copyText } from '@/features/today/use-today';
import { API_URL } from '@/lib/api-client';
import { useApiKeys, useCreateApiKey, useRevokeApiKey } from './api-keys';
import { useTranslations } from 'next-intl';
import { dateFormat } from '@/i18n/current';

const SCOPES: ApiKeyScope[] = ['read', 'write'];
const EXPIRY_DAYS = ['', '30', '90', '365'] as const;

/**
 * API key ของ Public API (Phase 8 ขั้น 4) — ให้สคริปต์/ระบบอื่นอ่าน-เขียนข้อมูลของตัวเองได้
 * key เต็มแสดงครั้งเดียวหลังสร้าง (เซิร์ฟเวอร์เก็บแค่ hash) · เพิกถอนแล้วใช้ไม่ได้ทันที
 */
export function ApiKeysCard() {
  const keys = useApiKeys();
  const revoke = useRevokeApiKey();
  const [created, setCreated] = useState<CreatedApiKeyDto | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const docsUrl = `${API_URL}/api/v1/docs`;
  const t = useTranslations('apiKeys');
  const day = (iso: string) => dateFormat({ dateStyle: 'medium' }).format(new Date(iso));

  return (
    <Card>
      <CardHeader
        icon={<KeyRound />}
        title={t('title')}
        description={
          <>
            {t('description')}{' '}
            <a
              href={docsUrl}
              target="_blank"
              rel="noreferrer"
              className="text-accent underline underline-offset-2"
            >
              {t('docs')}
            </a>
          </>
        }
      />
      <CardContent className="space-y-4">
        {created ? <NewKeyNotice created={created} onDone={() => setCreated(null)} /> : null}

        {keys.isPending ? (
          <Skeleton className="h-12 w-full" />
        ) : keys.isError ? (
          <p role="alert" className="text-sm text-danger">
            {t('loadFailed')}
          </p>
        ) : keys.data.length === 0 ? (
          <p className="text-sm text-fg-secondary">{t('empty')}</p>
        ) : (
          <ul className="divide-y divide-hairline" aria-label={t('listLabel')}>
            {keys.data.map((key) => {
              const expired = key.expiresAt !== null && new Date(key.expiresAt) <= new Date();
              const confirming = confirmingId === key.id;
              return (
                <li key={key.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{key.name}</p>
                    <p className="text-xs text-fg-secondary">
                      <span className="font-mono">{key.keyPrefix}…</span> ·{' '}
                      {t('created', { date: day(key.createdAt) })} ·{' '}
                      {key.lastUsedAt
                        ? t('lastUsed', { date: day(key.lastUsedAt) })
                        : t('neverUsed')}
                      {key.expiresAt
                        ? ` · ${expired ? t('expired') : t('expires', { date: day(key.expiresAt) })}`
                        : null}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    {key.scopes.map((s) => (
                      <Badge key={s} tone="outline" mono>
                        {s}
                      </Badge>
                    ))}
                  </div>
                  <Button
                    variant={confirming ? 'danger' : 'ghost'}
                    size="sm"
                    className="gap-1.5"
                    disabled={revoke.isPending}
                    aria-label={
                      confirming
                        ? t('confirmRevokeLabel', { name: key.name })
                        : t('revokeLabel', { name: key.name })
                    }
                    onClick={() => {
                      if (!confirming) return setConfirmingId(key.id);
                      revoke.mutate(key.id, { onSettled: () => setConfirmingId(null) });
                    }}
                  >
                    <Trash2 size={14} aria-hidden="true" />
                    {confirming ? t('confirm') : t('revoke')}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}

        <CreateKeyForm onCreated={setCreated} />
      </CardContent>
    </Card>
  );
}

function NewKeyNotice({ created, onDone }: { created: CreatedApiKeyDto; onDone: () => void }) {
  const t = useTranslations('apiKeys');
  async function copy() {
    if (await copyText(created.key)) toast.success(t('copied'));
    else toast.error(t('copyFailed'));
  }
  return (
    <div
      role="status"
      className="space-y-2 rounded-row border border-hairline-strong bg-sunken p-4"
    >
      <p className="text-sm font-medium">{t('copyNow', { name: created.name })}</p>
      <div className="flex gap-2">
        <Input
          readOnly
          value={created.key}
          aria-label={t('newKey')}
          className="font-mono text-xs"
          onFocus={(e) => e.currentTarget.select()}
        />
        <Button variant="secondary" onClick={copy} className="gap-1.5">
          <Copy size={14} aria-hidden="true" /> {t('copy')}
        </Button>
      </div>
      <Button variant="ghost" size="sm" onClick={onDone}>
        {t('stored')}
      </Button>
    </div>
  );
}

function CreateKeyForm({ onCreated }: { onCreated: (key: CreatedApiKeyDto) => void }) {
  const create = useCreateApiKey();
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<ApiKeyScope[]>(['read']);
  const [expiry, setExpiry] = useState('');
  const t = useTranslations('apiKeys');

  function toggle(scope: ApiKeyScope, on: boolean) {
    setScopes((prev) => (on ? [...prev, scope] : prev.filter((s) => s !== scope)));
  }

  return (
    <form
      className="space-y-3 border-t border-hairline pt-4"
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate(
          { name, scopes, expiresInDays: expiry ? Number(expiry) : null },
          {
            onSuccess: (key) => {
              onCreated(key);
              setName('');
            },
          },
        );
      }}
    >
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <div>
          <Label htmlFor="api-key-name">{t('name')}</Label>
          <Input
            id="api-key-name"
            placeholder={t('namePlaceholder')}
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="api-key-expiry">{t('expiryLabel')}</Label>
          <Select
            id="api-key-expiry"
            className="h-10"
            value={expiry}
            onChange={(e) => setExpiry(e.target.value)}
          >
            {EXPIRY_DAYS.map((days) => (
              <option key={days} value={days}>
                {days === ''
                  ? t('expiry.never')
                  : days === '365'
                    ? t('expiry.year')
                    : t('expiry.days', { days })}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <fieldset className="flex flex-wrap gap-x-5 gap-y-2">
        <legend className="mb-1.5 text-sm font-medium">{t('scopes')}</legend>
        {SCOPES.map((scope) => (
          <label key={scope} className="flex items-center gap-2 text-sm">
            <Checkbox
              shape="square"
              size="sm"
              checked={scopes.includes(scope)}
              onCheckedChange={(on) => toggle(scope, on)}
              aria-label={t(`scope.${scope}`)}
            />
            {t(`scope.${scope}`)}
          </label>
        ))}
      </fieldset>
      <Button
        type="submit"
        disabled={create.isPending || !name.trim() || scopes.length === 0}
        className="gap-1.5"
      >
        <KeyRound size={14} aria-hidden="true" />
        {create.isPending ? t('creating') : t('create')}
      </Button>
    </form>
  );
}
