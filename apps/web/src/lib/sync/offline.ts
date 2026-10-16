import type { SyncTarget } from '@nosion/contracts';
import { isNetworkError, type NewSyncOperation, type SyncEngine } from './sync-engine';

/** รายการที่สร้างตอนออฟไลน์ใช้ id ชั่วคราวนี้ในแคช — operation ถัดไปอ้างถึงด้วย clientId */
const LOCAL_PREFIX = 'local:';

export const localId = (clientId: string) => `${LOCAL_PREFIX}${clientId}`;
export const isLocalId = (id: string) => id.startsWith(LOCAL_PREFIX);
export const targetOf = (id: string): SyncTarget =>
  isLocalId(id) ? { clientId: id.slice(LOCAL_PREFIX.length) } : { id };

/** ผลที่ได้จากการเข้าคิว (ยังไม่ถึง server) — ผู้เรียกใช้ isQueued() เลือกข้อความแจ้งเตือน */
const queuedResults = new WeakSet<object>();
export const isQueued = (value: unknown): boolean =>
  typeof value === 'object' && value !== null && queuedResults.has(value);

export interface RunOrQueue<T> {
  /** ทางปกติ: เรียก API ตรง */
  online: () => Promise<T>;
  /** operation ที่จะเข้าคิวแทน */
  op: () => NewSyncOperation;
  /** ผลที่คืนให้ผู้เรียกเมื่อเข้าคิว — ภาพของรายการหลังทำ (ฝั่ง client คาดเอง) */
  local: () => T;
}

/**
 * ทางแยกเดียวของทุก mutation ที่ทำออฟไลน์ได้
 *  - ออฟไลน์ หรือคิวยังมีของค้าง (ต้องรักษาลำดับ: ห้ามแซงคิว) → เข้าคิว
 *  - ออนไลน์ → เรียก API ตรง · ถ้าเน็ตหลุดระหว่างทาง (ไม่ได้คำตอบ) → เข้าคิวแทนการแจ้ง error
 *  - server ตอบ error (ApiError) → โยนต่อตามเดิม — คิวไม่ได้ช่วยอะไร
 * คำขอที่ไปถึง server แล้วแต่คำตอบหาย → เข้าคิวซ้ำได้ · สร้าง/ติ๊กเสร็จปลอดภัย (clientId · idempotent)
 */
export async function runOrQueue<T>(
  engine: SyncEngine,
  isOnline: () => boolean,
  { online, op, local }: RunOrQueue<T>,
): Promise<T> {
  if (isOnline() && engine.getState().pending === 0) {
    try {
      return await online();
    } catch (err) {
      if (!isNetworkError(err)) throw err;
    }
  }
  await engine.enqueue(op());
  if (isOnline()) void engine.flush();
  const result = local();
  if (typeof result === 'object' && result !== null) queuedResults.add(result);
  return result;
}
