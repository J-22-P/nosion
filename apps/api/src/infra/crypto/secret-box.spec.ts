import { describe, expect, it } from 'vitest';
import { SecretBox } from './secret-box';

const KEY = 'a'.repeat(64);

describe('SecretBox (AES-256-GCM)', () => {
  const box = new SecretBox(KEY);

  it('เข้ารหัสแล้วถอดกลับได้ · ผลต่างกันทุกครั้ง (iv สุ่ม) · ไม่มีข้อความเดิมโผล่', () => {
    const a = box.seal('gho_secret-token', 'oauth-token');
    const b = box.seal('gho_secret-token', 'oauth-token');
    expect(a).not.toBe(b);
    expect(a).not.toContain('secret');
    expect(box.open(a, 'oauth-token')).toBe('gho_secret-token');
  });

  it('ถูกแก้แม้ตัวเดียว / คนละบริบท / คนละกุญแจ / รูปแบบผิด → null', () => {
    const sealed = box.seal('ค่าลับ', 'oauth-state');
    const last = sealed.at(-1) === 'A' ? 'B' : 'A';
    expect(box.open(sealed.slice(0, -1) + last, 'oauth-state')).toBeNull();
    expect(box.open(sealed, 'oauth-token')).toBeNull();
    expect(new SecretBox('b'.repeat(64)).open(sealed, 'oauth-state')).toBeNull();
    expect(box.open('garbage', 'oauth-state')).toBeNull();
  });

  it('กุญแจผิดรูปแบบ → โยน error ตั้งแต่สร้าง', () => {
    expect(() => new SecretBox('short')).toThrow();
  });
});
