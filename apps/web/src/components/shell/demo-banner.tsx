'use client';

import { FlaskConical } from 'lucide-react';
import Link from 'next/link';
import { tr } from '@/i18n/current';

/**
 * แถบบอกว่ากำลังใช้บัญชีทดลอง (Phase 8 ขั้น 8) — คนที่ได้ลิงก์ไปกด "ลองใช้ทันที" ต้องรู้ว่าข้อมูลจะหายใน 24 ชม.
 * และมีทางไปสมัครเพื่อเก็บข้อมูลของตัวเอง (สเปก 9.4)
 */
export function DemoBanner() {
  return (
    <div
      role="note"
      className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-hairline bg-accent-soft px-4 py-2 text-center text-[13px] text-fg"
    >
      <span className="inline-flex items-center gap-1.5">
        <FlaskConical size={14} aria-hidden="true" />
        {tr('demoBanner.text')}
      </span>
      <Link href="/register" className="font-medium text-accent underline underline-offset-2">
        {tr('demoBanner.cta')}
      </Link>
    </div>
  );
}
