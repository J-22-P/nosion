'use client';

import { useLocale, useTranslations } from 'next-intl';
import { LOCALES, writeLocaleCookie, type Locale } from '@/i18n/config';
import { cn } from '@nosion/ui';

/**
 * สลับภาษา — ตั้งคุกกี้แล้วโหลดหน้าใหม่ (middleware เลือกชุดภาษาตามคุกกี้ · i18n/config.ts)
 * `onChange` = งานเพิ่มก่อนโหลดใหม่ เช่น บันทึกลงบัญชี (หน้าตั้งค่า)
 */
export function LocaleSwitcher({
  className,
  onChange,
}: {
  className?: string;
  onChange?: (locale: Locale) => Promise<unknown> | void;
}) {
  const current = useLocale() as Locale;
  const t = useTranslations('common');

  async function choose(locale: Locale) {
    if (locale === current) return;
    writeLocaleCookie(locale);
    await onChange?.(locale);
    window.location.reload();
  }

  return (
    <div role="group" aria-label={t('language')} className={cn('flex gap-1 text-sm', className)}>
      {LOCALES.map((locale) => (
        <button
          key={locale}
          type="button"
          lang={locale}
          aria-pressed={locale === current}
          onClick={() => void choose(locale)}
          className={cn(
            'rounded-chip px-2.5 py-1 transition-colors',
            'focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]',
            locale === current
              ? 'bg-wash-active font-medium text-fg'
              : 'text-fg-secondary hover:bg-wash hover:text-fg',
          )}
        >
          {t(`languageName.${locale}`)}
        </button>
      ))}
    </div>
  );
}
