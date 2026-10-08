'use client';

import { cn } from '@nosion/ui';
import { useEffect, useId, useRef, useState } from 'react';
import { CHART_BG, CHART_FILL, CHART_STROKE, niceMax } from './analytics-data';

/**
 * กราฟหลาย series ของหน้า Analytics — SVG เขียนเอง (ไม่มี chart lib)
 * ข้อกำหนดจาก dataviz: ขั้นเทา --chart-1..6 (monochrome ตาม mockup) ลำดับตายตัว · series ที่ 2 ของกราฟเส้นเป็นเส้นประ · legend เสมอเมื่อ ≥ 2 series · ข้อความใช้สีข้อความ ไม่ใช่สี series ·
 * เส้น 2px · end-dot r4 + วงแหวนสีพื้น · แท่ง ≤ 24px ปลายมน 4px · ช่องว่าง 2px สีพื้นระหว่าง segment ·
 * ไม่มีแกน y คู่ · ตาราง sr-only คู่ทุกกราฟ (สีช่อง 3–5 บนพื้นขาว contrast < 3:1 → ต้องมีป้าย/ตารางเสมอ)
 */

/**
 * ความกว้างจริงของกล่องกราฟ (px) — ใช้เป็น viewBox ตรง ๆ ตัวอักษร 11px จึงเป็น 11px จริงทุกขนาดจอ
 * (เดิม viewBox 600 ถูกย่อเหลือ ~320px บนมือถือ → ป้ายแกนเหลือ ~6px อ่านไม่ออก)
 * ก่อนวัดได้ (SSR / เฟรมแรก) ใช้ fallback
 */
function useChartWidth(fallback = 600) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setWidth(Math.max(Math.round(el.clientWidth), 240));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

export interface Series {
  key: string;
  label: string;
  /** ขั้นเทา 0..5 (0 เข้มสุด) — ผูกกับ entity ไม่ใช่อันดับ */
  slot: number;
  /** เส้นประ — แยก series ด้วยรูปทรง ไม่ใช่สีอย่างเดียว (กราฟเส้นแบบ monochrome) */
  dashed?: boolean;
}

export function Legend({ series }: { series: Series[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-secondary">
      {series.map((s) => (
        <li key={s.key} className="flex items-center gap-1.5">
          {s.dashed ? (
            <svg aria-hidden="true" width="16" height="4" className="shrink-0">
              <line
                x1="0"
                y1="2"
                x2="16"
                y2="2"
                strokeWidth={2}
                strokeDasharray="4 3"
                className={CHART_STROKE[s.slot]}
              />
            </svg>
          ) : (
            <span aria-hidden="true" className={cn('size-2.5 rounded-[3px]', CHART_BG[s.slot])} />
          )}
          {s.label}
        </li>
      ))}
    </ul>
  );
}

// ── สัดส่วน (part-to-whole) เป็นแท่งแนวนอนแท่งเดียว ───────────────
export function ShareBar({
  slices,
  label,
}: {
  slices: { key: string; share: number; slot: number }[];
  label: string;
}) {
  const W = 600;
  const H = 20;
  const GAP = 2;
  let x = 0;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-5 w-full"
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
    >
      {slices.map((s, i) => {
        const w = s.share * W;
        const rect = (
          <rect
            key={s.key}
            x={x}
            y={0}
            // ช่องว่าง 2px สีพื้นระหว่าง segment (ไม่ใช่เส้นขอบ)
            width={Math.max(w - (i < slices.length - 1 ? GAP : 0), 0)}
            height={H}
            rx={i === 0 || i === slices.length - 1 ? 4 : 0}
            className={CHART_FILL[s.slot]}
          />
        );
        x += w;
        return rect;
      })}
    </svg>
  );
}

// ── เส้นแนวโน้มหลาย series (แกนเดียว) ───────────────────────
export function LineChart({
  categories,
  series,
  values,
  title,
  format,
  formatAxis,
}: {
  categories: { key: string; label: string }[];
  series: Series[];
  /** values[seriesIndex][categoryIndex] */
  values: number[][];
  title: string;
  format: (v: number) => string;
  formatAxis: (v: number) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const tableId = useId();
  const [boxRef, W] = useChartWidth();
  const H = 220;
  const L = 52;
  const R = 16;
  const T = 16;
  const B = 26;
  const plotW = W - L - R;
  const plotH = H - T - B;
  const max = niceMax(Math.max(...values.flat(), 0));
  const x = (i: number) =>
    L + (categories.length > 1 ? (i / (categories.length - 1)) * plotW : plotW / 2);
  const y = (v: number) => T + plotH - (v / max) * plotH;
  const ticks = [0, max / 2, max];

  return (
    <figure className="space-y-3">
      <Legend series={series} />
      <div ref={boxRef} className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full"
          role="img"
          aria-label={`${title} — รายละเอียดในตารางถัดไป`}
          aria-describedby={tableId}
          onPointerMove={(e) => {
            const box = e.currentTarget.getBoundingClientRect();
            const px = ((e.clientX - box.left) / box.width) * W;
            const i = Math.round(((px - L) / plotW) * (categories.length - 1));
            setHover(Math.min(Math.max(i, 0), categories.length - 1));
          }}
          onPointerLeave={() => setHover(null)}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={L}
                x2={W - R}
                y1={y(t)}
                y2={y(t)}
                strokeWidth={1}
                className="stroke-hairline-strong"
              />
              <text
                x={L - 8}
                y={y(t)}
                textAnchor="end"
                dominantBaseline="middle"
                className="fill-fg-secondary font-mono text-[11px]"
              >
                {formatAxis(t)}
              </text>
            </g>
          ))}
          {categories.map((c, i) => (
            <text
              key={c.key}
              x={x(i)}
              y={H - 6}
              textAnchor="middle"
              className={cn(
                'text-[11px]',
                hover === i ? 'fill-fg font-medium' : 'fill-fg-secondary',
              )}
            >
              {c.label}
            </text>
          ))}
          {hover !== null ? (
            <line
              x1={x(hover)}
              x2={x(hover)}
              y1={T}
              y2={T + plotH}
              strokeWidth={1}
              className="stroke-hairline-strong"
            />
          ) : null}
          {series.map((s, si) => {
            const pts = values[si]!.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(
              ' ',
            );
            const active = hover ?? categories.length - 1;
            return (
              <g key={s.key}>
                <polyline
                  points={pts}
                  fill="none"
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  strokeDasharray={s.dashed ? '6 4' : undefined}
                  className={CHART_STROKE[s.slot]}
                />
                {/* end-dot r4 + วงแหวนสีพื้น 2px ให้อ่านออกเมื่อเส้นตัดกัน */}
                <circle
                  cx={x(active)}
                  cy={y(values[si]![active]!)}
                  r={4}
                  strokeWidth={2}
                  className={cn(CHART_FILL[s.slot], 'stroke-surface')}
                />
              </g>
            );
          })}
        </svg>
        {hover !== null ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-0 -translate-x-1/2 rounded-[10px] bg-primary px-2.5 py-1.5 text-[11px] text-primary-fg shadow-float"
            style={{ left: `${(x(hover) / W) * 100}%` }}
          >
            <p className="font-medium">{categories[hover]!.label}</p>
            {series.map((s, si) => (
              <p key={s.key} className="flex items-center gap-1.5 whitespace-nowrap">
                <span className={cn('size-2 rounded-full', CHART_BG[s.slot])} />
                {s.label} <span className="nums font-mono">{format(values[si]![hover]!)}</span>
              </p>
            ))}
          </div>
        ) : null}
      </div>
      <DataTable
        id={tableId}
        title={title}
        categories={categories}
        series={series}
        values={values}
        format={format}
      />
    </figure>
  );
}

// ── แท่งซ้อน (stacked column) ─────────────────────────────
export function StackedColumns({
  categories,
  series,
  values,
  title,
  format,
  formatAxis,
}: {
  categories: { key: string; label: string }[];
  series: Series[];
  values: number[][];
  title: string;
  format: (v: number) => string;
  formatAxis: (v: number) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const tableId = useId();
  const [boxRef, W] = useChartWidth();
  const H = 220;
  const L = 52;
  const T = 16;
  const B = 26;
  const plotH = H - T - B;
  const band = (W - L) / categories.length;
  const barW = Math.min(24, band * 0.5);
  const totals = categories.map((_, ci) => series.reduce((a, _s, si) => a + values[si]![ci]!, 0));
  const max = niceMax(Math.max(...totals, 0));
  const scale = (v: number) => (v / max) * plotH;
  const ticks = [0, max / 2, max];

  return (
    <figure className="space-y-3">
      <Legend series={series} />
      <div ref={boxRef} className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full"
          role="img"
          aria-label={`${title} — รายละเอียดในตารางถัดไป`}
          aria-describedby={tableId}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={L}
                x2={W}
                y1={T + plotH - scale(t)}
                y2={T + plotH - scale(t)}
                strokeWidth={1}
                className="stroke-hairline-strong"
              />
              <text
                x={L - 8}
                y={T + plotH - scale(t)}
                textAnchor="end"
                dominantBaseline="middle"
                className="fill-fg-secondary font-mono text-[11px]"
              >
                {formatAxis(t)}
              </text>
            </g>
          ))}
          {categories.map((c, ci) => {
            const cx = L + band * ci + band / 2;
            let base = T + plotH;
            const segs = series.map((s, si) => {
              const h = scale(values[si]![ci]!);
              const top = series.length - 1 === si;
              // segment บนสุดมีปลายมน 4px · ระหว่าง segment เว้น 2px สีพื้น
              const gap = si > 0 && h > 0 ? 2 : 0;
              const y = base - h + gap;
              const height = Math.max(h - gap, 0);
              const r = top ? Math.min(4, height) : 0;
              const d =
                height > 0
                  ? `M${cx - barW / 2},${y + height} V${y + r} Q${cx - barW / 2},${y} ${cx - barW / 2 + r},${y} H${cx + barW / 2 - r} Q${cx + barW / 2},${y} ${cx + barW / 2},${y + r} V${y + height} Z`
                  : '';
              base -= h;
              return <path key={s.key} d={d} className={CHART_FILL[s.slot]} />;
            });
            return (
              <g
                key={c.key}
                onPointerEnter={() => setHover(ci)}
                onPointerLeave={() => setHover(null)}
              >
                <rect x={L + band * ci} y={T} width={band} height={plotH} fill="transparent" />
                {segs}
                <text
                  x={cx}
                  y={H - 6}
                  textAnchor="middle"
                  className={cn(
                    'text-[11px]',
                    hover === ci ? 'fill-fg font-medium' : 'fill-fg-secondary',
                  )}
                >
                  {c.label}
                </text>
              </g>
            );
          })}
        </svg>
        {hover !== null ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-0 -translate-x-1/2 rounded-[10px] bg-primary px-2.5 py-1.5 text-[11px] text-primary-fg shadow-float"
            style={{ left: `${((L + band * hover + band / 2) / W) * 100}%` }}
          >
            <p className="font-medium">
              {categories[hover]!.label} ·{' '}
              <span className="nums font-mono">{format(totals[hover]!)}</span>
            </p>
            {series.map((s, si) => (
              <p key={s.key} className="flex items-center gap-1.5 whitespace-nowrap">
                <span className={cn('size-2 rounded-full', CHART_BG[s.slot])} />
                {s.label} <span className="nums font-mono">{format(values[si]![hover]!)}</span>
              </p>
            ))}
          </div>
        ) : null}
      </div>
      <DataTable
        id={tableId}
        title={title}
        categories={categories}
        series={series}
        values={values}
        format={format}
      />
    </figure>
  );
}

function DataTable({
  id,
  title,
  categories,
  series,
  values,
  format,
}: {
  id: string;
  title: string;
  categories: { key: string; label: string }[];
  series: Series[];
  values: number[][];
  format: (v: number) => string;
}) {
  return (
    <table id={id} className="sr-only">
      <caption>{title}</caption>
      <thead>
        <tr>
          <th scope="col">เดือน</th>
          {series.map((s) => (
            <th key={s.key} scope="col">
              {s.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {categories.map((c, ci) => (
          <tr key={c.key}>
            <th scope="row">{c.label}</th>
            {series.map((s, si) => (
              <td key={s.key}>{format(values[si]![ci]!)}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
