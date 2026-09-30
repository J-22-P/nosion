import { describe, expect, it } from 'vitest';
import { parseQuickCapture, removeToken, sameName } from './quick-capture-parser';

describe('parseQuickCapture', () => {
  it('แยก priority / tag / project ออกจากชื่องาน', () => {
    const parsed = parseQuickCapture('fix login token refresh !urgent #backend +auth-v2');
    expect(parsed).toMatchObject({
      title: 'fix login token refresh',
      priority: 'urgent',
      tags: ['backend'],
      project: 'auth-v2',
    });
    expect(parsed.tokens.map((t) => t.raw)).toEqual(['!urgent', '#backend', '+auth-v2']);
  });

  it('token อยู่ตรงไหนของประโยคก็ได้ และรองรับคำไทยที่มีสระบน/ล่าง', () => {
    const parsed = parseQuickCapture('#งานบ้าน ล้างรถ !ด่วน ก่อนเที่ยง #ครอบครัว');
    expect(parsed.title).toBe('ล้างรถ ก่อนเที่ยง');
    expect(parsed.priority).toBe('urgent');
    expect(parsed.tags).toEqual(['งานบ้าน', 'ครอบครัว']);
  });

  it('ไม่ตีความ # หรือ + ที่อยู่กลางคำ', () => {
    const parsed = parseQuickCapture('เรียน C# และ 1+1');
    expect(parsed.title).toBe('เรียน C# และ 1+1');
    expect(parsed.tokens).toEqual([]);
  });

  it('priority ที่ไม่รู้จักคงไว้ในชื่อ · ตัวหลังชนะ · แท็กซ้ำนับครั้งเดียว', () => {
    const parsed = parseQuickCapture('a !important !low !high #x #X');
    expect(parsed.title).toBe('a !important');
    expect(parsed.priority).toBe('high');
    expect(parsed.tags).toEqual(['x']);
  });

  it('ข้อความว่างหรือมีแต่ token ได้ชื่อว่าง (ฟอร์มจะไม่ให้ส่ง)', () => {
    expect(parseQuickCapture('   ').title).toBe('');
    expect(parseQuickCapture('#a +b').title).toBe('');
  });
});

describe('removeToken', () => {
  it('ลบเฉพาะ token ที่ตรงทั้งคำ', () => {
    expect(removeToken('งาน #ui #uix', '#ui')).toBe('งาน #uix');
    expect(removeToken('#ui งาน', '#ui')).toBe('งาน');
  });
});

describe('sameName', () => {
  it('ไม่สนตัวพิมพ์ และถือว่า - _ ช่องว่าง เท่ากัน', () => {
    expect(sameName('auth-v2', 'Auth v2')).toBe(true);
    expect(sameName('NOSION_Core', 'nosion core')).toBe(true);
    expect(sameName('a', 'b')).toBe(false);
  });
});
