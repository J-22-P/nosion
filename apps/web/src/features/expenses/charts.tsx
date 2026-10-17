'use client';

import { cn } from '@nosion/ui';
import { useId, useState } from 'react';
import { tr } from '@/i18n/current';

/**
 * กราฟ SVG เขียนเอง (สเปก 8.11.3: ไม่โหลด chart lib เพื่อ LCP)
 * ข้อกำหนด: เส้น 2px · end-dot r4 มีวงแหวนสีพื้น 2px · แท่ง ≤ 24px ปลายมน 4px โคนเหลี่ยม ·
 * grid hairline 1px · series เดียวใช้สีเดียว (--track-fill) ไม่มี legend · ตัวเลขใช้สีข้อความ ไม่ใช่สีข้อมูล ·
 * hover/focus มี tooltip · มีตาราง sr-only ให้ screen reader (สีไม่ใช่ช่องทางเดียวของข้อมูล)
 */

// ── Sparkline ─────────────────────────────────────────
export function Sparkline({
  points,
  label,
  format,
  className,
}: {
  points: { x: string; y: number }[];
  /** คำอธิบายกราฟทั้งเส้นสำหรับ screen reader */
  label: string;
  format: (y: number) => string;
  className?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 160;
  const H = 40;
  const PAD = 5; // ให้ end-dot r4 + วงแหวนไม่ถูกตัด
  if (points.length === 0) return null;

  const max = Math.max(...points.map((p) => p.y), 1);
  const step = points.length > 1 ? (W - PAD * 2) / (points.length - 1) : 0;
  const xy = points.map((p, i) => ({
    x: PAD + i * step,
    y: H - PAD - (p.y / max) * (H - PAD * 2),
  }));
  const line = xy.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const area = `${line} L${xy.at(-1)!.x.toFixed(1)},${H - PAD} L${PAD},${H - PAD} Z`;
  const active = hover ?? points.length - 1;
  const dot = xy[active]!;

  return (
    <div className={cn('relative', className)}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-10 w-full overflow-visible"
        preserveAspectRatio="none"
        role="img"
        aria-label={label}
        onPointerMove={(e) => {
          const box = e.currentTarget.getBoundingClientRect();
          const ratio = (e.clientX - box.left) / box.width;
          setHover(Math.round(ratio * (points.length - 1)));
        }}
        onPointerLeave={() => setHover(null)}
      >
        <path d={area} className="fill-track-fill opacity-10" />
        <path
          d={line}
          fill="none"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          className="stroke-track-fill"
        />
        {hover !== null ? (
          <line
            x1={dot.x}
            x2={dot.x}
            y1={PAD}
            y2={H - PAD}
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
            className="stroke-hairline-strong"
          />
        ) : null}
      </svg>
      {/* end-dot เป็น HTML เพื่อไม่ถูกยืดตาม preserveAspectRatio="none" */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-track-fill ring-2 ring-surface"
        style={{ left: `${(dot.x / W) * 100}%`, top: `${(dot.y / H) * 100}%` }}
      />
      {hover !== null ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -top-7 -translate-x-1/2 whitespace-nowrap rounded-[8px] bg-primary px-2 py-1 font-mono text-[11px] text-primary-fg"
          style={{ left: `${(dot.x / W) * 100}%` }}
        >
          {points[hover]!.x.slice(8)} · {format(points[hover]!.y)}
        </span>
      ) : null}
    </div>
  );
}

// ── Column chart ─────────────────────────────────────
export interface Column {
  key: string;
  /** ป้ายแกน x เช่น "ก.ย." */
  label: string;
  value: number;
  /** เดือนที่ยังไม่จบ — สีจางลงและบอกด้วยข้อความ ไม่ใช่สีอย่างเดียว */
  partial?: boolean;
}

export function ColumnChart({
  columns,
  title,
  format,
  formatAxis,
}: {
  columns: Column[];
  title: string;
  format: (v: number) => string;
  formatAxis: (v: number) => string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const tableId = useId();
  const W = 320;
  const H = 160;
  const LEFT = 44;
  const BOTTOM = 22;
  const TOP = 18;
  const plotH = H - TOP - BOTTOM;
  const band = (W - LEFT) / Math.max(columns.length, 1);
  const barW = Math.min(24, band * 0.5);

  // แกน y: 0, ครึ่ง, เต็ม ปัดเป็นเลขกลม
  const rawMax = Math.max(...columns.map((c) => c.value), 1);
  const magnitude = 10 ** Math.floor(Math.log10(rawMax));
  const niceMax = Math.ceil(rawMax / magnitude) * magnitude;
  const ticks = [0, niceMax / 2, niceMax];
  const y = (v: number) => TOP + plotH - (v / niceMax) * plotH;
  // label ตัวเลขเฉพาะแท่งที่เลือก (ค่าเริ่มต้น = เดือนล่าสุดที่จบแล้ว) — ไม่ใส่ทุกแท่ง
  let lastComplete = columns.length - 1;
  while (lastComplete > 0 && columns[lastComplete]!.partial) lastComplete--;
  const labelled = active ?? lastComplete;

  return (
    <figure>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label={tr('charts.detailsBelow', { title })}
        aria-describedby={tableId}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={LEFT}
              x2={W}
              y1={y(t)}
              y2={y(t)}
              strokeWidth={1}
              className="stroke-hairline-strong"
            />
            <text
              x={LEFT - 6}
              y={y(t)}
              textAnchor="end"
              dominantBaseline="middle"
              className="fill-fg-secondary font-mono text-[10px]"
            >
              {formatAxis(t)}
            </text>
          </g>
        ))}
        {columns.map((c, i) => {
          const cx = LEFT + band * i + band / 2;
          const top = y(c.value);
          const h = Math.max(TOP + plotH - top, 0);
          const r = Math.min(4, h);
          // ปลายมน 4px โคนเหลี่ยม: path แทน rect rx (rx มนทั้งสี่มุม)
          const d =
            h > 0
              ? `M${cx - barW / 2},${TOP + plotH} V${top + r} Q${cx - barW / 2},${top} ${cx - barW / 2 + r},${top} H${cx + barW / 2 - r} Q${cx + barW / 2},${top} ${cx + barW / 2},${top + r} V${TOP + plotH} Z`
              : '';
          return (
            // hover อย่างเดียว: svg เป็น role="img" (ลูกเป็น presentational) จึงไม่ใส่ปุ่มที่ focus ได้ข้างใน
            // ผู้ใช้คีย์บอร์ด / screen reader ได้ตัวเลขทุกเดือนจากตาราง sr-only ด้านล่าง
            <g
              key={c.key}
              onPointerEnter={() => setActive(i)}
              onPointerLeave={() => setActive(null)}
            >
              {/* พื้นที่ hover ทั้ง band ใหญ่กว่าแท่ง */}
              <rect x={LEFT + band * i} y={TOP} width={band} height={plotH} fill="transparent" />
              <path d={d} className={cn('fill-track-fill', c.partial && 'opacity-40')} />
              {i === labelled ? (
                <text
                  x={cx}
                  y={top - 5}
                  textAnchor="middle"
                  className="fill-fg font-mono text-[10px] font-medium"
                >
                  {format(c.value)}
                </text>
              ) : null}
              <text
                x={cx}
                y={H - 6}
                textAnchor="middle"
                className={cn(
                  'text-[10px]',
                  i === active ? 'fill-fg font-medium' : 'fill-fg-secondary',
                )}
              >
                {c.label}
              </text>
            </g>
          );
        })}
      </svg>
      <table id={tableId} className="sr-only">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th scope="col">{tr('charts.month')}</th>
            <th scope="col">{tr('charts.amount')}</th>
          </tr>
        </thead>
        <tbody>
          {columns.map((c) => (
            <tr key={c.key}>
              <th scope="row">
                {c.label}
                {c.partial ? tr('charts.partialSuffix') : ''}
              </th>
              <td>{format(c.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {columns.some((c) => c.partial) ? (
        <figcaption className="mt-1 text-xs text-fg-secondary">
          {tr('charts.partialNote')}
        </figcaption>
      ) : null}
    </figure>
  );
}
