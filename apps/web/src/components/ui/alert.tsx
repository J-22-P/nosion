import { AlertTriangle, CheckCircle2, Info, OctagonAlert } from 'lucide-react';
import { cn } from '@nosion/ui';
import type * as React from 'react';

type AlertTone = 'info' | 'warning' | 'danger' | 'success';

const TONE: Record<AlertTone, { box: string; icon: string; Icon: typeof Info }> = {
  info: { box: 'bg-accent-soft', icon: 'text-accent', Icon: Info },
  warning: { box: 'bg-warning-soft', icon: 'text-warning', Icon: AlertTriangle },
  danger: { box: 'bg-danger-soft', icon: 'text-danger', Icon: OctagonAlert },
  success: { box: 'bg-success-soft', icon: 'text-success', Icon: CheckCircle2 },
};

/**
 * Alert inline (สเปก 8.7.5) · radius 14px, พื้น *-soft, ไอคอน + ข้อความ 2 บรรทัด (หัว + คำแนะนำ)
 * danger/warning ใช้ role="alert" ที่เหลือเป็น status
 */
export function Alert({
  tone = 'info',
  title,
  children,
  action,
  className,
}: {
  tone?: AlertTone;
  title: React.ReactNode;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  const { box, icon, Icon } = TONE[tone];
  return (
    <div
      role={tone === 'danger' || tone === 'warning' ? 'alert' : 'status'}
      className={cn('flex items-start gap-3 rounded-[14px] px-4 py-3', box, className)}
    >
      <Icon size={18} aria-hidden="true" className={cn('mt-px shrink-0', icon)} />
      <div className="min-w-0 flex-1 text-[13px]">
        <p className="font-medium text-fg">{title}</p>
        {children ? <div className="mt-0.5 text-fg-secondary">{children}</div> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
