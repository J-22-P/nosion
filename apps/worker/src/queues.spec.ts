import { describe, expect, it } from 'vitest';
import { DEFAULT_JOB_OPTIONS, QUEUE } from './queues';

describe('ค่าเริ่มต้นของคิว', () => {
  it('retry แบบ exponential อย่างน้อย 5 ครั้ง ก่อนตกไปเป็น DLQ', () => {
    expect(DEFAULT_JOB_OPTIONS.attempts).toBeGreaterThanOrEqual(5);
    expect(DEFAULT_JOB_OPTIONS.backoff.type).toBe('exponential');
  });

  it('เก็บ job ที่ล้มไว้ 7 วันเพื่อให้ตามสอบได้', () => {
    expect(DEFAULT_JOB_OPTIONS.removeOnFail.age).toBe(7 * 24 * 3600);
  });

  it('ชื่อคิวไม่ซ้ำกัน', () => {
    const names = Object.values(QUEUE);
    expect(new Set(names).size).toBe(names.length);
  });
});
