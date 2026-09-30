import { describe, expect, it } from 'vitest';
import { progressRatio, progressTone } from './progress';

describe('progressRatio', () => {
  it('บีบค่าให้อยู่ใน 0..1 และไม่หารด้วยศูนย์', () => {
    expect(progressRatio(5, 8)).toBeCloseTo(0.625);
    expect(progressRatio(12, 8)).toBe(1);
    expect(progressRatio(-1, 8)).toBe(0);
    expect(progressRatio(3, 0)).toBe(0);
    expect(progressRatio(Number.NaN, 8)).toBe(0);
  });
});

describe('progressTone', () => {
  it('งบ: ต่ำกว่า 85% ปกติ · 85% ขึ้นไปเตือน · 100% ขึ้นไปเกิน', () => {
    expect(progressTone(84, 100, true)).toBe('default');
    expect(progressTone(85, 100, true)).toBe('warning');
    expect(progressTone(100, 100, true)).toBe('danger');
    expect(progressTone(130, 100, true)).toBe('danger');
  });

  it('ไม่ใช่งบ: เต็มแค่ไหนก็ไม่เปลี่ยนสี', () => {
    expect(progressTone(100, 100, false)).toBe('default');
  });
});
