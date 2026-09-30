import { cn } from '@nosion/ui';

/**
 * โลโก้ NOSION (8.7.7) — ตัว N ขาวบนสี่เหลี่ยมมนดำ rx = 24% พร้อมขอบ #27272a
 * สีคงที่ทั้งสองธีม (เป็นแบรนด์ ไม่ใช่ token) · ไฟล์เดียวกับ app/icon.svg
 */
export function LogoMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      aria-hidden="true"
      className={cn('shrink-0', className)}
    >
      <rect
        x="1"
        y="1"
        width="98"
        height="98"
        rx="24"
        fill="#000"
        stroke="#27272a"
        strokeWidth="2"
      />
      <path d="M32 72V28h7.5l21.5 30.5V28H68v44h-7.5L39 41.5V72z" fill="#fff" />
    </svg>
  );
}
