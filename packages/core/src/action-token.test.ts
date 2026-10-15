import { describe, expect, it } from 'vitest';
import { ACTION_TOKEN_TTL_MS, signActionToken, verifyActionToken } from './action-token';

const SECRET = 'x'.repeat(48);
const now = new Date('2027-01-10T00:00:00Z');
const token = signActionToken({ userId: 'u1', entryId: 'e1' }, SECRET, now);

describe('action token', () => {
  it('เซ็นแล้วตรวจผ่าน ได้ user + entry เดิม', () => {
    expect(verifyActionToken(token, SECRET, now)).toEqual({
      userId: 'u1',
      entryId: 'e1',
      exp: now.getTime() + ACTION_TOKEN_TTL_MS,
    });
  });

  it('หมดอายุหลัง 7 วัน', () => {
    expect(
      verifyActionToken(token, SECRET, new Date(now.getTime() + ACTION_TOKEN_TTL_MS)),
    ).toBeNull();
  });

  it('secret อื่น → ไม่ผ่าน', () => {
    expect(verifyActionToken(token, 'y'.repeat(48), now)).toBeNull();
  });

  it('แก้ entry ใน body (เอา token ของรายการหนึ่งไปใช้กับอีกรายการ) → ลายเซ็นไม่ตรง', () => {
    const [body, mac] = token.split('.');
    const claims = JSON.parse(Buffer.from(body!, 'base64url').toString());
    const forged = Buffer.from(JSON.stringify({ ...claims, e: 'e2' })).toString('base64url');
    expect(verifyActionToken(`${forged}.${mac}`, SECRET, now)).toBeNull();
  });

  it.each(['', 'abc', 'abc.', '.def', 'a.b.c', `${token}x`])('รูปแบบผิด %j → null', (bad) => {
    expect(verifyActionToken(bad, SECRET, now)).toBeNull();
  });
});
