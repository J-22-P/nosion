'use client';

import { OAUTH_PROVIDERS, type OAuthProvider } from '@nosion/contracts';
import { useSearchParams } from 'next/navigation';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@nosion/ui';
import { API_URL } from '@/lib/api-client';
import { oauthErrorMessage, oauthStartUrl, PROVIDER_LABEL, useOAuthProviders } from './oauth';
import { ProviderIcon } from './provider-icons';

/**
 * ปุ่ม "ดำเนินการต่อด้วย Google / GitHub" (Phase 8 ขั้น 4b)
 * เป็นลิงก์ธรรมดา (top-level navigation) — OAuth ต้องพาเบราว์เซอร์ไปหน้าผู้ให้บริการ fetch ทำแทนไม่ได้
 *
 * แสดงทุกปุ่มตั้งแต่แรก แล้วค่อยซ่อนอันที่เซิร์ฟเวอร์ปิดไว้ — production เปิดครบ จึงไม่มีอะไรขยับ (CLS)
 * ต่างจากรอคำตอบก่อนค่อยวาดปุ่ม ซึ่งดันฟอร์มลงทุกครั้ง
 */
export function OAuthButtons() {
  const providers = useOAuthProviders();
  const visible = OAUTH_PROVIDERS.filter((p) => providers.data?.[p] ?? true);
  if (visible.length === 0) return null;

  return (
    <div className="grid gap-2">
      {visible.map((provider) => (
        <ProviderLink key={provider} provider={provider} />
      ))}
    </div>
  );
}

function ProviderLink({ provider }: { provider: OAuthProvider }) {
  return (
    <a
      href={`${API_URL}/api/v1/auth/oauth/${provider}`}
      // href จริงต่อท้ายโซนเวลาของเครื่อง — คำนวณตอนกด (ตอน render ฝั่ง server ไม่รู้โซนของผู้ใช้)
      onClick={(e) => {
        e.currentTarget.href = oauthStartUrl(provider);
      }}
      className={cn(buttonVariants({ variant: 'secondary', size: 'lg' }), 'w-full')}
    >
      <ProviderIcon provider={provider} />
      ดำเนินการต่อด้วย {PROVIDER_LABEL[provider]}
    </a>
  );
}

/** ข้อความเมื่อกลับมาจากผู้ให้บริการแล้วล้ม (`/login?oauth_error=…`) */
export function OAuthErrorAlert() {
  const params = useSearchParams();
  const message = oauthErrorMessage(params.get('oauth_error'));
  if (!message) return null;
  return (
    <p role="alert" className="rounded-control bg-danger-soft px-4 py-3 text-sm text-danger">
      {message}
    </p>
  );
}
