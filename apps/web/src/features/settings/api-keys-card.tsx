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

const SCOPES: { scope: ApiKeyScope; label: string }[] = [
  { scope: 'read', label: 'อ่าน (GET)' },
  { scope: 'write', label: 'เขียน (สร้าง/แก้/ลบ)' },
];

const EXPIRY_OPTIONS = [
  { value: '', label: 'ไม่หมดอายุ' },
  { value: '30', label: '30 วัน' },
  { value: '90', label: '90 วัน' },
  { value: '365', label: '1 ปี' },
];

const dateFormat = new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium' });

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

  return (
    <Card>
      <CardHeader
        icon={<KeyRound />}
        title="API key"
        description={
          <>
            ให้สคริปต์หรือระบบอื่นเรียกข้อมูลของคุณ ·{' '}
            <a
              href={docsUrl}
              target="_blank"
              rel="noreferrer"
              className="text-accent underline underline-offset-2"
            >
              เอกสาร API
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
            โหลดรายการ API key ไม่สำเร็จ
          </p>
        ) : keys.data.length === 0 ? (
          <p className="text-sm text-fg-secondary">ยังไม่มี API key</p>
        ) : (
          <ul className="divide-y divide-hairline" aria-label="API key ที่ใช้งานได้">
            {keys.data.map((key) => {
              const expired = key.expiresAt !== null && new Date(key.expiresAt) <= new Date();
              const confirming = confirmingId === key.id;
              return (
                <li key={key.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{key.name}</p>
                    <p className="text-xs text-fg-secondary">
                      <span className="font-mono">{key.keyPrefix}…</span> · สร้าง{' '}
                      {dateFormat.format(new Date(key.createdAt))} ·{' '}
                      {key.lastUsedAt
                        ? `ใช้ล่าสุด ${dateFormat.format(new Date(key.lastUsedAt))}`
                        : 'ยังไม่เคยใช้'}
                      {key.expiresAt
                        ? ` · ${expired ? 'หมดอายุแล้ว' : `หมดอายุ ${dateFormat.format(new Date(key.expiresAt))}`}`
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
                    aria-label={confirming ? `ยืนยันเพิกถอน ${key.name}` : `เพิกถอน ${key.name}`}
                    onClick={() => {
                      if (!confirming) return setConfirmingId(key.id);
                      revoke.mutate(key.id, { onSettled: () => setConfirmingId(null) });
                    }}
                  >
                    <Trash2 size={14} aria-hidden="true" />
                    {confirming ? 'ยืนยัน' : 'เพิกถอน'}
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
  async function copy() {
    if (await copyText(created.key)) toast.success('คัดลอก API key แล้ว');
    else toast.error('คัดลอกไม่ได้ — เลือกข้อความในช่องแล้วคัดลอกเอง');
  }
  return (
    <div
      role="status"
      className="space-y-2 rounded-row border border-hairline-strong bg-sunken p-4"
    >
      <p className="text-sm font-medium">
        คัดลอก key ของ “{created.name}” เก็บไว้ตอนนี้ — ปิดกล่องนี้แล้วจะไม่เห็นอีก
      </p>
      <div className="flex gap-2">
        <Input
          readOnly
          value={created.key}
          aria-label="API key ใหม่"
          className="font-mono text-xs"
          onFocus={(e) => e.currentTarget.select()}
        />
        <Button variant="secondary" onClick={copy} className="gap-1.5">
          <Copy size={14} aria-hidden="true" /> คัดลอก
        </Button>
      </div>
      <Button variant="ghost" size="sm" onClick={onDone}>
        เก็บแล้ว ปิด
      </Button>
    </div>
  );
}

function CreateKeyForm({ onCreated }: { onCreated: (key: CreatedApiKeyDto) => void }) {
  const create = useCreateApiKey();
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<ApiKeyScope[]>(['read']);
  const [expiry, setExpiry] = useState('');

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
          <Label htmlFor="api-key-name">ชื่อ key</Label>
          <Input
            id="api-key-name"
            placeholder="เช่น สคริปต์สรุปรายจ่าย"
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="api-key-expiry">อายุ</Label>
          <Select
            id="api-key-expiry"
            className="h-10"
            value={expiry}
            onChange={(e) => setExpiry(e.target.value)}
          >
            {EXPIRY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <fieldset className="flex flex-wrap gap-x-5 gap-y-2">
        <legend className="mb-1.5 text-sm font-medium">สิทธิ์</legend>
        {SCOPES.map(({ scope, label }) => (
          <label key={scope} className="flex items-center gap-2 text-sm">
            <Checkbox
              shape="square"
              size="sm"
              checked={scopes.includes(scope)}
              onCheckedChange={(on) => toggle(scope, on)}
              aria-label={label}
            />
            {label}
          </label>
        ))}
      </fieldset>
      <Button
        type="submit"
        disabled={create.isPending || !name.trim() || scopes.length === 0}
        className="gap-1.5"
      >
        <KeyRound size={14} aria-hidden="true" />
        {create.isPending ? 'กำลังสร้าง…' : 'สร้าง API key'}
      </Button>
    </form>
  );
}
