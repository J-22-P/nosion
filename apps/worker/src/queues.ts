/** ชื่อคิวรวมไว้ที่เดียว — ฝั่ง producer (API) และ consumer (worker) อ้างค่าเดียวกัน */
export const QUEUE = {
  reminder: 'reminder',
  /** sweeper ทุก 1 นาที (สเปก 10.1 `reminder-sweep`) */
  reminderSweep: 'reminder-sweep',
  /** job ที่ retry ครบแล้วยังล้ม — เก็บไว้ retry ด้วยมือ (สเปก 6.2) */
  reminderDlq: 'reminder-dlq',
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

/** การเตือน: backoff 30s, 1m, 2m, 4m, 8m ตามสเปก 6.2 — ปลายทาง (push service) ล่มชั่วคราวมักกลับมาในไม่กี่นาที */
export const REMINDER_JOB_OPTIONS = {
  ...DEFAULT_JOB_OPTIONS,
  backoff: { type: 'exponential' as const, delay: 30_000 },
};
