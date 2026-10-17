import { z } from 'zod';

/**
 * API key ของ Public API (สเปก 7.3 · 9.3 "API key มี scope (`read`, `write`) และตรวจทุกครั้ง")
 * read = GET อย่างเดียว · write = สร้าง/แก้/ลบ (ไม่รวม read — ขอทั้งคู่ถ้าต้องการทั้งสองอย่าง)
 */
export const apiKeyScopeSchema = z.enum(['read', 'write']);
export type ApiKeyScope = z.infer<typeof apiKeyScopeSchema>;

export const createApiKeySchema = z.object({
  name: z.string().trim().min(1, 'ตั้งชื่อให้จำได้ว่าใช้ที่ไหน').max(60),
  scopes: z
    .array(apiKeyScopeSchema)
    .min(1, 'เลือกอย่างน้อย 1 สิทธิ์')
    .transform((s) => [...new Set(s)]),
  /** ไม่ระบุ = ไม่หมดอายุ (เพิกถอนเองได้ตลอด) */
  expiresInDays: z.number().int().min(1).max(365).nullish(),
});
export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;
export type CreateApiKeyFormValues = z.input<typeof createApiKeySchema>;

export interface ApiKeyDto {
  id: string;
  name: string;
  /** ส่วนต้นของ key ที่ไม่ใช่ความลับ — ให้ผู้ใช้จำได้ว่าเป็นอันไหน */
  keyPrefix: string;
  scopes: ApiKeyScope[];
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export interface CreatedApiKeyDto extends ApiKeyDto {
  /** key เต็ม — แสดงครั้งเดียวตอนสร้าง เซิร์ฟเวอร์เก็บแค่ hash */
  key: string;
}
