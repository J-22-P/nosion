import { cn } from '@nosion/ui';
import type * as React from 'react';

/**
 * การ์ด level 1 (สเปก 8.7.4–8.7.5) · radius 20px (hero 28px) · padding 24px (มือถือ 16–20px)
 * ความลึกมาจากพื้นผิว + hairline ไม่ใช่เงาเข้ม
 */
export function Card({
  className,
  hero = false,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { hero?: boolean }) {
  return (
    <div
      className={cn(
        'border border-hairline bg-surface text-fg shadow-card',
        hero ? 'rounded-panel' : 'rounded-card',
        className,
      )}
      {...props}
    />
  );
}

/**
 * หัวการ์ด: ไอคอนในกล่อง 40px + ชื่อ + คำอธิบายรอง + ตัวบอกสถานะด้านขวา
 */
export function CardHeader({
  className,
  icon,
  title,
  description,
  aside,
  children,
  ...props
}: Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> & {
  icon?: React.ReactNode;
  title?: React.ReactNode;
  description?: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <div className={cn('flex items-start gap-3 p-5 pb-3 md:p-6 md:pb-4', className)} {...props}>
      {icon ? (
        <div
          aria-hidden="true"
          className="flex size-10 shrink-0 items-center justify-center rounded-control bg-sunken text-fg [&_svg]:size-[18px]"
        >
          {icon}
        </div>
      ) : null}
      <div className="min-w-0 flex-1">
        {title ? <CardTitle>{title}</CardTitle> : null}
        {description ? <CardDescription>{description}</CardDescription> : null}
        {children}
      </div>
      {aside ? <div className="shrink-0">{aside}</div> : null}
    </div>
  );
}

/**
 * หัวการ์ด — ค่าเริ่มต้น h2: การ์ดวางตรงใต้ h1 ของหน้า (h1 → h3 ข้ามระดับ = axe/Lighthouse `heading-order`)
 * การ์ดที่ซ้อนอยู่ใต้หัวข้อ h2 อีกชั้นส่ง `as="h3"`
 */
export function CardTitle({
  className,
  as: Heading = 'h2',
  ...props
}: React.HTMLAttributes<HTMLHeadingElement> & { as?: 'h2' | 'h3' }) {
  return <Heading className={cn('text-base font-semibold leading-snug', className)} {...props} />;
}

export function CardDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('mt-0.5 text-[13px] text-fg-secondary', className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-5 pb-5 md:px-6 md:pb-6', className)} {...props} />;
}

/** แถวรายการในการ์ด level 1.5 · radius 16px · hover wash */
export function ListRow({ className, ...props }: React.HTMLAttributes<HTMLLIElement>) {
  return (
    <li
      className={cn(
        'group flex items-center gap-3 rounded-row bg-sunken p-4 transition-colors duration-[180ms] hover:bg-wash-active',
        className,
      )}
      {...props}
    />
  );
}
