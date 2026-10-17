import { describe, expect, it } from 'vitest';
import { extractApiKey, generateApiKey, hashApiKey, isApiKey, requiredScope } from './api-key';

describe('API key', () => {
  it('สร้าง key ที่มีคำนำหน้า · hash ตรงกับ key · prefix เป็นส่วนต้นของ key', () => {
    const { key, hash, prefix } = generateApiKey();
    expect(key).toMatch(/^nos_[A-Za-z0-9_-]{43}$/);
    expect(hash).toBe(hashApiKey(key));
    expect(key.startsWith(prefix)).toBe(true);
    expect(prefix).toHaveLength(12);
  });

  it('สุ่มไม่ซ้ำกัน', () => {
    expect(generateApiKey().key).not.toBe(generateApiKey().key);
  });

  it('แยก API key ออกจาก JWT ด้วยคำนำหน้า', () => {
    expect(isApiKey('nos_abc')).toBe(true);
    expect(isApiKey('eyJhbGciOiJIUzI1NiJ9.x.y')).toBe(false);
  });

  it('GET/HEAD = read · ที่เหลือ = write', () => {
    expect(requiredScope('GET')).toBe('read');
    expect(requiredScope('head')).toBe('read');
    for (const m of ['POST', 'PATCH', 'PUT', 'DELETE']) expect(requiredScope(m)).toBe('write');
  });

  it('อ่าน key จาก Bearer หรือ X-API-Key · JWT ใน Bearer ไม่นับ', () => {
    expect(extractApiKey({ authorization: 'Bearer nos_x' })).toBe('nos_x');
    expect(extractApiKey({ apiKey: ' nos_y ' })).toBe('nos_y');
    expect(extractApiKey({ authorization: 'Bearer eyJ.a.b' })).toBeNull();
    expect(extractApiKey({ authorization: 'Bearer eyJ.a.b', apiKey: 'nos_z' })).toBe('nos_z');
    expect(extractApiKey({ apiKey: 'not-a-key' })).toBeNull();
    expect(extractApiKey({})).toBeNull();
  });
});
