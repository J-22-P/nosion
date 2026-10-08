import type { CategoryAmountDto, ExpenseCategory } from '@nosion/contracts';

/** จำนวนขั้นเทาของกราฟ (--chart-1..6 เข้ม → อ่อน) — เกินนี้พับเป็น "อื่น ๆ" ห้ามวน */
export const CHART_SLOTS = 6;
export const CHART_FILL = [
  'fill-chart-1',
  'fill-chart-2',
  'fill-chart-3',
  'fill-chart-4',
  'fill-chart-5',
  'fill-chart-6',
] as const;
export const CHART_BG = [
  'bg-chart-1',
  'bg-chart-2',
  'bg-chart-3',
  'bg-chart-4',
  'bg-chart-5',
  'bg-chart-6',
] as const;
export const CHART_STROKE = [
  'stroke-chart-1',
  'stroke-chart-2',
  'stroke-chart-3',
  'stroke-chart-4',
  'stroke-chart-5',
  'stroke-chart-6',
] as const;

export interface ShareSlice {
  key: ExpenseCategory | 'rest';
  amountMinor: number;
  share: number;
  /** หมวดที่ถูกพับรวมใน "อื่น ๆ" */
  folded: ExpenseCategory[];
}

/**
 * หมวดเรียงมากไปน้อย → 5 อันดับแรก + "อื่น ๆ" (รวมหมวด other เดิมกับที่เหลือ) = ไม่เกิน 6 slot
 * ถ้ามีไม่เกิน 6 หมวดก็แสดงครบไม่พับ
 */
export function foldCategories(rows: CategoryAmountDto[], slots = CHART_SLOTS): ShareSlice[] {
  const sorted = [...rows]
    .filter((r) => r.amountMinor > 0)
    .sort((a, b) => b.amountMinor - a.amountMinor);
  const total = sorted.reduce((a, r) => a + r.amountMinor, 0);
  const slice = (r: CategoryAmountDto): ShareSlice => ({
    key: r.category,
    amountMinor: r.amountMinor,
    share: total ? r.amountMinor / total : 0,
    folded: [],
  });
  if (sorted.length <= slots) return sorted.map(slice);
  const keep = sorted.filter((r) => r.category !== 'other').slice(0, slots - 1);
  const rest = sorted.filter((r) => !keep.includes(r));
  const restAmount = rest.reduce((a, r) => a + r.amountMinor, 0);
  return [
    ...keep.map(slice),
    {
      key: 'rest',
      amountMinor: restAmount,
      share: total ? restAmount / total : 0,
      folded: rest.map((r) => r.category),
    },
  ];
}

/** สเกลแกน y ที่ปัดเป็นเลขกลม: 0 / ครึ่ง / เต็ม — max เป็น 1, 2, 2.5, 5 หรือ 10 × 10^n ที่ ≥ ค่าจริง */
export function niceMax(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((m) => m * magnitude >= value)!;
  return step * magnitude;
}
