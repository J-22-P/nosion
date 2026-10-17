'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { useTranslations } from 'next-intl';

type ThemeChoice = 'system' | 'light' | 'dark';

const ICONS = {
  system: <Monitor aria-hidden="true" />,
  light: <Sun aria-hidden="true" />,
  dark: <Moon aria-hidden="true" />,
} as const;
const CHOICES = ['system', 'light', 'dark'] as const;

/**
 * เลือกธีม system / light / dark (สเปก 8.7)
 * ไม่มี flash ตอนโหลด เพราะ next-themes ฉีด script อ่านค่าจาก localStorage ก่อน hydrate
 * แต่ค่าที่เลือกรู้ได้เฉพาะฝั่ง client → render ตัวยึดที่ขนาดเท่ากันก่อน mount กัน layout shift
 */
export function ThemeSwitcher({ compact = false }: { compact?: boolean }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const value = (mounted ? theme : 'system') as ThemeChoice;
  const t = useTranslations('theme');
  const options = CHOICES.map((choice) =>
    compact
      ? { value: choice, label: ICONS[choice], ariaLabel: t(choice) }
      : { value: choice, label: t(choice) },
  );

  return (
    <SegmentedControl<ThemeChoice>
      label={t('label')}
      size={compact ? 'sm' : 'md'}
      value={value}
      onChange={setTheme}
      options={options}
    />
  );
}
