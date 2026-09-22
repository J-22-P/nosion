import { describe, expect, it } from 'vitest';
import { isValidTimeZone } from './timezone';

describe('isValidTimeZone', () => {
  it('รับ IANA timezone ที่มีจริง', () => {
    expect(isValidTimeZone('Asia/Bangkok')).toBe(true);
    expect(isValidTimeZone('America/New_York')).toBe(true);
    expect(isValidTimeZone('UTC')).toBe(true);
  });

  it('ปฏิเสธค่ามั่ว — ถ้าหลุดเข้า DB ทุก engine จะคำนวณเวลาเพี้ยน', () => {
    expect(isValidTimeZone('Asia/Bangkok2')).toBe(false);
    expect(isValidTimeZone('GMT+7')).toBe(false);
  });
});
