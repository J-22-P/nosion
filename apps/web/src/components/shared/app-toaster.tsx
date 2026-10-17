'use client';

import { CircleCheck, Info, LoaderCircle, OctagonAlert, TriangleAlert, X } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Toaster } from 'sonner';

/** ค่าเดียวกับ `--toast-duration` ใน globals.css (แถบนับเวลาวิ่งตามค่านี้) */
export const TOAST_DURATION = 5000;

/**
 * Toast ของทั้งแอป — sonner เดิม (เรียก `toast.success(...)` ที่ไหนก็ได้เหมือนเดิม) แต่หน้าตาเป็นของระบบ:
 * การ์ด surface + hairline + shadow-float · ไอคอนในวงกลมสีอ่อนตามประเภท · แถบนับเวลาด้านล่าง
 * (หยุดเมื่อชี้เมาส์ — sonner ก็หยุดนับ) · หลายอันซ้อนเป็น stack ชี้แล้วกางออกดูครบ
 * (รายละเอียดไม่พับบรรทัด: sonner วัดความสูงการ์ดครั้งเดียวตอนแสดง ขยายทีหลังข้อความจะล้นการ์ด)
 * สีมาจาก token ทั้งหมด → สลับธีมสว่าง/มืดตามแอป และผ่าน contrast เดียวกับส่วนอื่น (ADR-009)
 */
export function AppToaster() {
  const { resolvedTheme } = useTheme();
  return (
    <Toaster
      position="bottom-right"
      theme={resolvedTheme === 'dark' ? 'dark' : 'light'}
      closeButton
      duration={TOAST_DURATION}
      gap={10}
      icons={{
        success: <CircleCheck size={16} strokeWidth={2} />,
        error: <OctagonAlert size={16} strokeWidth={2} />,
        warning: <TriangleAlert size={16} strokeWidth={2} />,
        info: <Info size={16} strokeWidth={2} />,
        loading: <LoaderCircle size={16} strokeWidth={2} className="animate-spin" />,
        close: <X size={14} />,
      }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            'nosion-toast flex w-[var(--width)] items-start gap-3 overflow-hidden rounded-card border border-hairline bg-surface py-3.5 pl-3.5 pr-10 text-fg shadow-float',
          icon: 'nosion-toast-icon flex size-8 shrink-0 items-center justify-center rounded-full',
          content: 'flex min-w-0 flex-1 flex-col gap-0.5 pt-1',
          title: 'text-sm font-semibold leading-snug',
          description: 'text-[13px] leading-snug text-fg-secondary',
          actionButton:
            'mt-0.5 h-8 shrink-0 self-center rounded-chip bg-primary px-3 text-[13px] font-medium text-primary-fg transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]',
          cancelButton:
            'mt-0.5 h-8 shrink-0 self-center rounded-chip border border-hairline bg-wash px-3 text-[13px] font-medium text-fg hover:bg-wash-active',
          closeButton:
            'absolute right-2.5 top-2.5 flex size-7 items-center justify-center rounded-full text-fg-secondary transition-colors hover:bg-wash hover:text-fg focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]',
        },
      }}
    />
  );
}
