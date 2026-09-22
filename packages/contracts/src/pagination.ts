import { z } from 'zod';

/** cursor-based เสมอ — offset พังเมื่อข้อมูลเปลี่ยนระหว่างเลื่อนหน้า */
export const cursorPaginationSchema = z.object({
  cursor: z.string().nullish(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  withTotal: z.coerce.boolean().default(false),
});
export type CursorPagination = z.infer<typeof cursorPaginationSchema>;

export interface PageInfo {
  nextCursor: string | null;
  hasMore: boolean;
}

export interface Paginated<T> {
  data: T[];
  pageInfo: PageInfo;
  meta?: { total: number };
}
