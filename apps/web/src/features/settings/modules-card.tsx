'use client';

import { MODULE_THEME } from '@nosion/ui';
import { LayoutGrid } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { AVAILABLE_MODULES, useEnabledModules } from './use-modules';
import { moduleLabel } from '@/i18n/current';
import { useTranslations } from 'next-intl';

/**
 * เปิด/ปิดโมดูล — ปิดแล้ว Today, ปฏิทิน, ⌘K, สรุปสัปดาห์ จะไม่ถามโมดูลนั้น (registry กรองด้วย enabledModules)
 * ข้อมูลเดิมไม่หาย เปิดกลับมาก็เห็นเหมือนเดิม
 */
export function ModulesCard() {
  const modules = useEnabledModules();
  const t = useTranslations('settings');
  return (
    <Card>
      <CardHeader icon={<LayoutGrid />} title={t('modules')} description={t('modulesHint')} />
      <CardContent>
        <ul className="divide-y divide-hairline">
          {AVAILABLE_MODULES.map(({ key, ready }) => {
            const on = modules.isEnabled(key);
            return (
              <li key={key} className="flex items-center gap-3 py-3">
                <Checkbox
                  shape="square"
                  checked={on}
                  disabled={!ready || modules.pending || !modules.loaded}
                  onCheckedChange={(next) => modules.setEnabled(key, next)}
                  aria-label={t('enableModule', { module: moduleLabel(key) })}
                />
                <span className="font-mono text-xs" style={{ color: MODULE_THEME[key].cssVar }}>
                  {MODULE_THEME[key].prefix}
                </span>
                <span className="flex-1 text-sm">{moduleLabel(key)}</span>
                {!ready ? <Badge tone="outline">{t('soon')}</Badge> : null}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
