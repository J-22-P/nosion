import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * ลายเซ็นของ GitHub webhook: `X-Hub-Signature-256: sha256=<HMAC-SHA256(secret, body ดิบ)>`
 * ต้องคำนวณจาก **ไบต์ที่ได้รับจริง** — JSON.stringify(req.body) ใหม่อาจเรียง/เว้นวรรคไม่ตรงเดิม → ลายเซ็นไม่ตรงทั้งที่ถูก
 * เทียบแบบเวลาคงที่ กันเดาลายเซ็นทีละไบต์จากเวลาตอบกลับ
 */
export function verifyGitHubSignature(
  secret: string,
  rawBody: Buffer,
  header: string | undefined,
): boolean {
  if (!header?.startsWith('sha256=')) return false;
  const expected = Buffer.from(
    `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`,
  );
  const received = Buffer.from(header);
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export function signGitHubPayload(secret: string, rawBody: Buffer | string): string {
  return `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
}
