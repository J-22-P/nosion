'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { SegmentedControl } from '@/components/ui/segmented-control';

type ThemeChoice = 'system' | 'light' | 'dark';

const OPTIONS = [
  { value: 'system', label: <Monitor aria-hidden="true" />, ariaLabel: 'ตามระบบ' },
  { value: 'light', label: <Sun aria-hidden="true" />, ariaLabel: 'สว่าง' },
  { value: 'dark', label: <Moon aria-hidden="true" />, ariaLabel: 'มืด' },
] as const;

const OPTIONS_WITH_TEXT = [
  { value: 'system', label: 'ตามระบบ' },
  { value: 'light', label: 'สว่าง' },
  { value: 'dark', label: 'มืด' },
] as const;

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

  return (
    <SegmentedControl<ThemeChoice>
      label="ธีม"
      size={compact ? 'sm' : 'md'}
      value={value}
      onChange={setTheme}
      options={compact ? OPTIONS : OPTIONS_WITH_TEXT}
    />
  );
}
