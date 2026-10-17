'use client';

import { cn } from '@nosion/ui';
import type { ElementType, HTMLAttributes } from 'react';
import ReactMarkdown, { type Components, type ExtraProps } from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';

/** element ที่มีแค่ class ของเรา — ตัด `node` (AST ของ react-markdown) ออกก่อนส่งลง DOM */
function styled(Tag: ElementType, base: string) {
  return function Styled({
    node: _node,
    className,
    ...props
  }: ExtraProps & HTMLAttributes<HTMLElement>) {
    return <Tag className={cn(base, className)} {...props} />;
  };
}

const HEADING = 'font-semibold first:mt-0';

/**
 * แสดง Markdown แบบ GitHub (GFM: ตาราง · checklist · ขีดฆ่า · ลิงก์อัตโนมัติ)
 * รายละเอียดงานที่ดึงจาก GitHub มี HTML ปนมา (`<img width=…>`) → rehype-raw แปลงเป็น element จริง
 * แล้ว rehype-sanitize กรองด้วย schema เดียวกับที่ GitHub ใช้ (ไม่มี script / on* / style)
 * จึงแสดงข้อความจากภายนอกได้ปลอดภัย
 */
const COMPONENTS: Components = {
  h1: styled('h1', `mb-3 mt-5 border-b border-hairline pb-1.5 text-xl ${HEADING}`),
  h2: styled('h2', `mb-3 mt-5 border-b border-hairline pb-1.5 text-lg ${HEADING}`),
  h3: styled('h3', `mb-2 mt-4 text-base ${HEADING}`),
  h4: styled('h4', `mb-2 mt-4 text-sm ${HEADING}`),
  h5: styled('h5', `mb-2 mt-4 text-sm ${HEADING}`),
  h6: styled('h6', `mb-2 mt-4 text-sm text-fg-secondary ${HEADING}`),
  p: styled('p', 'my-2.5 leading-relaxed first:mt-0 last:mb-0'),
  ul: styled(
    'ul',
    'my-2.5 list-disc space-y-1 pl-6 [&.contains-task-list]:list-none [&.contains-task-list]:pl-1',
  ),
  ol: styled('ol', 'my-2.5 list-decimal space-y-1 pl-6'),
  blockquote: styled(
    'blockquote',
    'my-2.5 border-l-4 border-hairline-strong pl-3 text-fg-secondary',
  ),
  hr: styled('hr', 'my-4 border-hairline'),
  table: ({ node: _node, ...props }) => (
    <div className="my-3 overflow-x-auto">
      <table className="w-full border-collapse text-[13px]" {...props} />
    </div>
  ),
  th: styled('th', 'border border-hairline bg-sunken px-3 py-1.5 text-left font-semibold'),
  td: styled('td', 'border border-hairline px-3 py-1.5 align-top'),
  pre: styled('pre', 'my-2.5 overflow-x-auto rounded-control bg-sunken p-3 font-mono text-xs'),
  // โค้ดในบรรทัดมีพื้นของตัวเอง · โค้ดใน <pre> ใช้พื้นของ pre
  code: styled(
    'code',
    'font-mono text-[0.9em] [:not(pre)>&]:rounded-[4px] [:not(pre)>&]:bg-sunken [:not(pre)>&]:px-1 [:not(pre)>&]:py-0.5',
  ),
  a: ({ node: _node, ...props }) => (
    <a
      {...props}
      target="_blank"
      rel="noreferrer noopener"
      className="text-accent hover:underline"
    />
  ),
  // รายการ checklist: ห่อด้วย <label> → checkbox มีชื่อ (ข้อความของรายการ) ให้ screen reader อ่าน
  li: ({ node: _node, className, children, ...props }) =>
    className?.includes('task-list-item') ? (
      <li className={className} {...props}>
        <label>{children}</label>
      </li>
    ) : (
      <li className={className} {...props}>
        {children}
      </li>
    ),
  // checklist ของ GFM — แสดงอย่างเดียว ติ๊กในหน้าแสดงผลไม่ได้
  input: ({ node: _node, ...props }) => (
    <input {...props} disabled className="mr-1.5 align-middle" />
  ),
  img: ({ node: _node, alt, ...props }) => (
    // eslint-disable-next-line @next/next/no-img-element -- รูปจากภายนอก (GitHub) ไม่รู้ขนาดล่วงหน้า
    <img
      {...props}
      alt={alt ?? ''}
      loading="lazy"
      className="my-2 inline-block h-auto max-w-full rounded-control"
    />
  ),
};

export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn('min-w-0 break-words text-sm text-fg', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, rehypeSanitize]}
        components={COMPONENTS}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
