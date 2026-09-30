import { cn } from '@nosion/ui';

export type ConnectionStatus = 'online' | 'offline' | 'syncing';

const STYLE: Record<ConnectionStatus, { dot: string; text: string }> = {
  online: { dot: 'bg-success', text: 'text-fg-secondary' },
  offline: { dot: 'bg-danger', text: 'text-danger' },
  syncing: { dot: 'bg-accent animate-pulse', text: 'text-accent' },
};

/**
 * Status pill ของการเชื่อมต่อ (สเปก 8.7.5 / 8.2) — จุด 6px + ข้อความ 12px
 * ไม่สื่อด้วยสีอย่างเดียว: ข้อความบอกสถานะเสมอ
 */
export function StatusPill({
  status,
  label,
  className,
}: {
  status: ConnectionStatus;
  label: string;
  className?: string;
}) {
  const style = STYLE[status];
  return (
    <span
      role="status"
      aria-live="polite"
      className={cn(
        'inline-flex h-7 items-center gap-2 rounded-chip border border-hairline bg-wash px-3 text-xs font-medium',
        style.text,
        className,
      )}
    >
      <span aria-hidden="true" className={cn('size-1.5 rounded-full', style.dot)} />
      {label}
    </span>
  );
}
