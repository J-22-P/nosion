/** GitHub integration (Phase 8 ขั้น 5 · สเปก 15 "GitHub integration (webhook ปิด task เมื่อ PR merged)") */

export interface GitHubIntegrationDto {
  /** เชื่อมบัญชี GitHub แล้ว (ผ่าน OAuth) */
  connected: boolean;
  login: string | null;
  /** ได้สิทธิ์ `repo` = เห็น issue ของ repo ส่วนตัวด้วย */
  privateRepos: boolean;
  lastSyncAt: string | null;
  lastSyncCount: number | null;
  /**
   * รหัสปัญหาของการดึงครั้งล่าสุด — `revoked` · `forbidden` · `rate_limited` · `unreachable` · `http_<status>`
   * (เว็บแปลเป็นข้อความตามภาษา) · null = สำเร็จ
   */
  lastSyncError: string | null;
  /** ได้สิทธิ์ `read:project` = อ่านวันจากช่องวันที่ของ GitHub Project ได้ */
  projectDates: boolean;
  /** ดึงค้างอยู่ (issue เยอะ แบ่งหลายรอบ) */
  syncInProgress: boolean;
  webhook: {
    /** URL ที่ใส่ใน repo → Settings → Webhooks (มีเสมอเมื่อเปิดใช้) */
    url: string | null;
    configured: boolean;
    lastDeliveryAt: string | null;
  };
}

export interface GitHubSyncResultDto {
  created: number;
  updated: number;
  /** ปิดงานเพราะ issue ถูกปิดบน GitHub */
  completed: number;
  /** issue ที่ดูแล้วไม่ต้องทำอะไร */
  unchanged: number;
  /** ยังดึงไม่ครบ (แบ่งรอบเพราะเวลาของ function จำกัด) — เรียก sync ซ้ำเพื่อดึงต่อ */
  more: boolean;
}

export interface GitHubWebhookSecretDto {
  url: string;
  /** แสดงครั้งเดียว — เซิร์ฟเวอร์เก็บแบบเข้ารหัสไว้ตรวจลายเซ็น */
  secret: string;
}

/**
 * อ้างถึงงาน NOSION จาก PR: ใส่ `nosion:<id ของงาน>` ในชื่อ/คำอธิบาย/ชื่อ branch
 * → PR merged แล้วงานนั้นปิดเอง
 */
export const NOSION_REF_PATTERN = /nosion[:#-]([a-z0-9]{20,32})\b/gi;

export function nosionRef(entryId: string): string {
  return `nosion:${entryId}`;
}

/** หา id ของงานที่ถูกอ้างถึงในข้อความ (ไม่ซ้ำ · ตามลำดับที่เจอ) */
export function findNosionRefs(...texts: Array<string | null | undefined>): string[] {
  const ids = new Set<string>();
  for (const text of texts) {
    if (!text) continue;
    for (const match of text.matchAll(NOSION_REF_PATTERN)) ids.add(match[1]!.toLowerCase());
  }
  return [...ids];
}
