import { describe, expect, it } from 'vitest';
import { parseDuration, TokenService } from './token.service';

describe('parseDuration', () => {
  it.each([
    ['15m', 900],
    ['30d', 2_592_000],
    ['2h', 7_200],
    ['45s', 45],
  ])('%s → %i วินาที', (input, expected) => {
    expect(parseDuration(input)).toBe(expected);
  });

  it('รูปแบบผิด → โยน error ตอน bootstrap ไม่ใช่ตอนมีผู้ใช้', () => {
    expect(() => parseDuration('15 minutes')).toThrow();
  });
});

describe('TokenService.hashToken', () => {
  it('hash เดิมเสมอสำหรับ token เดิม และไม่มี token ดิบอยู่ในผลลัพธ์', () => {
    const hash = TokenService.hashToken('abc');
    expect(hash).toBe(TokenService.hashToken('abc'));
    expect(hash).toHaveLength(64);
    expect(hash).not.toContain('abc');
  });

  it('token คนละใบ → hash คนละค่า', () => {
    expect(TokenService.hashToken('a')).not.toBe(TokenService.hashToken('b'));
  });
});

describe('TokenService.createOneTimeToken', () => {
  it('สุ่มไม่ซ้ำและ hash ตรงกับ token', () => {
    const a = TokenService.createOneTimeToken();
    const b = TokenService.createOneTimeToken();
    expect(a.token).not.toBe(b.token);
    expect(a.hash).toBe(TokenService.hashToken(a.token));
  });
});
