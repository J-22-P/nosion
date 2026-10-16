import type { EntryDto } from '@nosion/contracts';
import type { QueryClient } from '@tanstack/react-query';

function looksLikeEntry(value: unknown, id: string): value is EntryDto {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Partial<EntryDto>;
  return v.id === id && typeof v.title === 'string' && typeof v.version === 'number';
}

function search(value: unknown, id: string, depth: number): EntryDto | null {
  if (looksLikeEntry(value, id)) return value;
  if (depth === 0 || typeof value !== 'object' || value === null) return null;
  for (const child of Array.isArray(value) ? value : Object.values(value)) {
    const found = search(child, id, depth - 1);
    if (found) return found;
  }
  return null;
}

/**
 * หารายการจากแคชของ TanStack Query (ทุก key ที่ขึ้นต้นด้วย 'entries' — รายการงาน, Today, ปฏิทิน ฯลฯ)
 * ใช้คาดภาพรายการหลังทำตอนออฟไลน์ และเป็น "ค่าก่อนแก้" (base) ของ operation update
 * แคชแต่ละหน้ารูปร่างต่างกัน จึงไล่หาแบบลึกจำกัดชั้น แทนการรู้จักทุกรูปร่าง
 */
export function findCachedEntry(queryClient: QueryClient, id: string): EntryDto | null {
  for (const [, data] of queryClient.getQueriesData({ queryKey: ['entries'] })) {
    const found = search(data, id, 4);
    if (found) return found;
  }
  return null;
}
