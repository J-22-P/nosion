import { cn } from '@nosion/ui';
import { progressRatio, progressTone } from '@/lib/progress';

const FILL = {
  default: 'bg-track-fill',
  warning: 'bg-warning',
  danger: 'bg-danger',
} as const;

const STROKE = {
  default: 'stroke-track-fill',
  warning: 'stroke-warning',
  danger: 'stroke-danger',
} as const;

interface ProgressProps {
  value: number;
  max?: number;
  /** ใช้กฎสีของงบ ≥85% / ≥100% */
  budget?: boolean;
  /** ข้อความให้ screen reader เช่น "งบอาหาร" */
  label: string;
  className?: string;
}

/** Progress bar สูง 6–8px pill (สเปก 8.7.5) */
export function Progress({ value, max = 100, budget = false, label, className }: ProgressProps) {
  const ratio = progressRatio(value, max);
  const tone = progressTone(value, max, budget);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.min(Math.max(value, 0), max)}
      className={cn('h-1.5 w-full overflow-hidden rounded-chip bg-track', className)}
    >
      <div
        className={cn(
          'h-full rounded-chip transition-[width] duration-[180ms] ease-standard',
          FILL[tone],
        )}
        style={{ width: `${ratio * 100}%` }}
      />
    </div>
  );
}

/** Progress ring 32–40px stroke 3px — หัวการ์ด Tasks */
export function ProgressRing({
  value,
  max = 100,
  budget = false,
  label,
  size = 36,
  className,
}: ProgressProps & { size?: number }) {
  const stroke = 3;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const ratio = progressRatio(value, max);
  const tone = progressTone(value, max, budget);
  return (
    <svg
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.min(Math.max(value, 0), max)}
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={cn('-rotate-90', className)}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        strokeWidth={stroke}
        className="stroke-track"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - ratio)}
        className={cn(
          'transition-[stroke-dashoffset] duration-[180ms] ease-standard',
          STROKE[tone],
        )}
      />
    </svg>
  );
}
