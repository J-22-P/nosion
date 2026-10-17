import { describe, expect, it } from 'vitest';
import { signGitHubPayload, verifyGitHubSignature } from './signature';

describe('verifyGitHubSignature', () => {
  const secret = 'webhook-secret';
  const body = Buffer.from('{"action":"closed","number":1}');

  it('ลายเซ็นถูก → ผ่าน (ตัวอย่างจากเอกสาร GitHub ให้ผลตรงกัน)', () => {
    // https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries#testing-the-webhook-payload-validation
    expect(
      verifyGitHubSignature(
        "It's a Secret to Everybody",
        Buffer.from('Hello, World!'),
        'sha256=757107ea0eb2509fc211221cce984b8a37570b6d7586c22c46f4379c8b043e17',
      ),
    ).toBe(true);
    expect(verifyGitHubSignature(secret, body, signGitHubPayload(secret, body))).toBe(true);
  });

  it('body ถูกแก้ / secret ผิด / ไม่มี header / รูปแบบผิด → ไม่ผ่าน', () => {
    const sig = signGitHubPayload(secret, body);
    expect(verifyGitHubSignature(secret, Buffer.from('{"action":"opened"}'), sig)).toBe(false);
    expect(verifyGitHubSignature('other', body, sig)).toBe(false);
    expect(verifyGitHubSignature(secret, body, undefined)).toBe(false);
    expect(verifyGitHubSignature(secret, body, sig.replace('sha256=', 'sha1='))).toBe(false);
    expect(verifyGitHubSignature(secret, body, 'sha256=abc')).toBe(false);
  });
});
