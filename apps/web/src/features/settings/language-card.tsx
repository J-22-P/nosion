'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Languages } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { LocaleSwitcher } from '@/components/shared/locale-switcher';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { authApi, type MeResponse } from '@/features/auth/api';
import { intlLocale } from '@/i18n/config';
import { setBuddhistEra } from '@/i18n/current';
import { errorText } from '@/i18n/errors';

/**
 * ภาษา + ปีพุทธศักราช (สเปก 8.9) — ค่าของบัญชี (ทุกเครื่องเห็นตรงกัน)
 * สลับภาษา: บันทึกลงบัญชีก่อน แล้วโหลดหน้าใหม่ (LocaleSwitcher ตั้งคุกกี้ให้)
 */
export function LanguageCard({ settings }: { settings: MeResponse['settings'] }) {
  const t = useTranslations('settings');
  const locale = useLocale();
  const queryClient = useQueryClient();

  const save = useMutation({
    mutationFn: authApi.updateSettings,
    onSuccess: (next) => {
      setBuddhistEra(next.buddhistEra);
      queryClient.setQueryData<MeResponse | null>(['session'], (prev) =>
        prev ? { ...prev, settings: next } : prev,
      );
      // วันที่ทั้งแอปจัดรูปแบบใหม่ตามค่าใหม่
      void queryClient.invalidateQueries({ queryKey: ['entries'] });
    },
    onError: (error) => toast.error(t('saveFailed'), { description: errorText(error) }),
  });

  const example = new Intl.DateTimeFormat(intlLocale('th', true), { dateStyle: 'long' }).format(
    new Date(),
  );

  return (
    <Card>
      <CardHeader
        icon={<Languages />}
        title={t('language')}
        description={t('languageHint')}
        aside={
          <LocaleSwitcher
            onChange={(next) =>
              save.mutateAsync({ locale: next }).catch(() => undefined) as Promise<unknown>
            }
          />
        }
      />
      {locale === 'th' ? (
        <CardContent>
          <label className="flex items-start gap-3 text-sm">
            <Checkbox
              shape="square"
              checked={settings.buddhistEra}
              disabled={save.isPending}
              onCheckedChange={(buddhistEra) => save.mutate({ buddhistEra })}
              aria-label={t('buddhistEra')}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium">{t('buddhistEra')}</span>
              <span className="block text-xs text-fg-secondary">
                {t('buddhistEraExample', { example })}
              </span>
            </span>
          </label>
        </CardContent>
      ) : null}
    </Card>
  );
}
