import { NextResponse, type NextRequest } from 'next/server';

/**
 * proxy `/api/v1/*` → API (staging/production บน Vercel · ดู rewrites ใน next.config.ts)
 *
 * rewrite ธรรมดาทำให้ API เห็นทุกคำขอมาจาก IP ของ Vercel ตัวเดียว → rate limit ต่อ IP กลายเป็นโควตารวมทั้งโลก
 * (เจอจริง Phase 8: demo login ของทุกคนรวมกันได้ 5 ครั้ง/ชม.) — ที่นี่ rewrite เองพร้อมแนบ IP ผู้ใช้
 * + รหัสลับร่วม (`API_PROXY_KEY`) ที่ API ใช้ยืนยันว่ามาจาก proxy ของเราจริง (apps/api/src/common/client-ip.ts)
 * ไม่ได้ตั้ง `API_PROXY_TARGET`/`API_PROXY_KEY` (local) → ปล่อยผ่าน ใช้ rewrite เดิม/เรียก API ตรง
 */
export function middleware(request: NextRequest): NextResponse {
  const target = process.env.API_PROXY_TARGET;
  const key = process.env.API_PROXY_KEY;
  if (!target || !key) return NextResponse.next();

  const headers = new Headers(request.headers);
  // ค่าที่ผู้ใช้ส่งมาเองไม่นับ — เขียนทับเสมอ
  headers.delete('x-nosion-client-ip');
  headers.delete('x-nosion-proxy-key');
  // Vercel edge เขียน x-forwarded-for เป็น IP ผู้ใช้ (ปลอมจาก client ไม่ได้) — ตัวแรกคือผู้ใช้
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip')?.trim();
  if (ip) headers.set('x-nosion-client-ip', ip);
  headers.set('x-nosion-proxy-key', key);

  const url = new URL(request.nextUrl.pathname + request.nextUrl.search, target);
  return NextResponse.rewrite(url, { request: { headers } });
}

export const config = { matcher: '/api/v1/:path*' };
