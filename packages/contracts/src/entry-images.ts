import { z } from 'zod';

/**
 * รูปย่อของรูปในรายละเอียดงาน (เช่น รูปแนบใน issue ของ repo ส่วนตัวบน GitHub — ฝังข้ามโดเมนไม่ได้เพราะไม่มีคุกกี้)
 * client ที่เปิดรูปต้นฉบับได้ (สคริปต์ `gh` ในเครื่องผู้ใช้) ย่อเป็น WebP แล้วส่งมาเก็บ · หน้าเว็บแสดงรูปย่อแทน
 */
export const ENTRY_IMAGE_MAX_BYTES = 400 * 1024;
export const ENTRY_IMAGE_MAX_PER_ENTRY = 30;
export const ENTRY_IMAGE_MAX_SIDE = 4000;

export const putEntryImageSchema = z.object({
  /** URL ของรูปตามที่อยู่ใน description — ตัวจับคู่ตอนแสดงผล */
  sourceUrl: z.string().url().startsWith('https://').max(2048),
  /** WebP เข้ารหัส base64 */
  data: z
    .string()
    .min(1)
    .max(Math.ceil((ENTRY_IMAGE_MAX_BYTES * 4) / 3) + 4),
  width: z.number().int().min(1).max(ENTRY_IMAGE_MAX_SIDE),
  height: z.number().int().min(1).max(ENTRY_IMAGE_MAX_SIDE),
});
export type PutEntryImageInput = z.infer<typeof putEntryImageSchema>;

/** เก็บเฉพาะรูปที่ยังอยู่ใน description — ที่เหลือลบ (issue ถูกแก้แล้วเอารูปออก) */
export const pruneEntryImagesSchema = z.object({
  keep: z.array(z.string().max(2048)).max(ENTRY_IMAGE_MAX_PER_ENTRY),
});
export type PruneEntryImagesInput = z.infer<typeof pruneEntryImagesSchema>;

export interface EntryImageDto {
  entryId: string;
  sourceUrl: string;
  /** URL ของรูปย่อ — มีลายเซ็นในตัว ใส่ใน <img> ได้เลยโดยไม่ต้องแนบ token */
  url: string;
  width: number;
  height: number;
  sizeBytes: number;
}
