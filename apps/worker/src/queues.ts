/** ชื่อคิวรวมไว้ที่เดียว — ฝั่ง producer (API) และ consumer (worker) อ้างค่าเดียวกัน */
export const QUEUE = {
  reminder: 'reminder',
  recurrence: 'recurrence',
  digest: 'digest',
  cleanup: 'cleanup',
} as const;

export type QueueName = (typeof QUEUE)[keyof typeof QUEUE];

/**
 * ค่าเริ่มต้นของ job: retry แบบ exponential และเก็บ job ที่ล้มไว้ 7 วัน
 * งานที่ retry จนครบแล้วยังล้ม จะค้างอยู่ใน failed set ทำหน้าที่เป็น DLQ
 */
export const DEFAULT_JOB_OPTIONS = {
  attempts: 5,
  backoff: { type: 'exponential' as const, delay: 5_000 },
  removeOnComplete: { age: 24 * 3600, count: 1_000 },
  removeOnFail: { age: 7 * 24 * 3600 },
};
