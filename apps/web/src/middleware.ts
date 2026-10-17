import { NextResponse, type NextRequest } from 'next/server';
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE } from './i18n/config';

/**
 * proxy `/api/v1/*` → API (staging/production บน Vercel · ดู rewrites ใน next.config.ts)
 *
 * rewrite ธรรมดาทำให้ API เห็นทุกคำขอมาจาก IP ของ Vercel ตัวเดียว → rate limit ต่อ IP กลายเป็นโควตารวมทั้งโลก
 * (เจอจริง Phase 8: demo login ของทุกคนรวมกันได้ 5 ครั้ง/ชม.) — ที่นี่ rewrite เองพร้อมแนบ IP ผู้ใช้
 * + รหัสลับร่วม (`API_PROXY_KEY`) ที่ API ใช้ยืนยันว่ามาจาก proxy ของเราจริง (apps/api/src/common/client-ip.ts)
 * ไม่ได้ตั้ง `API_PROXY_TARGET`/`API_PROXY_KEY` (local) → ปล่อยผ่าน ใช้ rewrite เดิม/เรียก API ตรง
 */
export function middleware(request: NextRequest): NextResponse {
  if (!request.nextUrl.pathname.startsWith('/api/')) return rewriteToLocale(request);
  return proxyApi(request);
}

/**
 * หน้าเว็บ: `/today` → `/<locale>/today` ภายใน (URL ที่ผู้ใช้เห็นไม่เปลี่ยน) — ภาษาจากคุกกี้ `NOSION_LOCALE` (ดู i18n/config.ts)
 * เปิด `/en/today` ตรง ๆ → redirect กลับ `/today` พร้อมตั้งคุกกี้ (มี URL เดียวต่อหน้า ไม่แตกเป็นสองชุด)
 */
function rewriteToLocale(request: NextRequest): NextResponse {
  const { pathname, search } = request.nextUrl;
  const [, first, ...rest] = pathname.split('/');
  if (isLocale(first)) {
    const res = NextResponse.redirect(new URL(`/${rest.join('/')}${search}`, request.url));
    res.cookies.set(LOCALE_COOKIE, first, { path: '/', maxAge: 31_536_000, sameSite: 'lax' });
    return res;
  }
  const cookie = request.cookies.get(LOCALE_COOKIE)?.value;
  const locale = isLocale(cookie) ? cookie : DEFAULT_LOCALE;
  const url = request.nextUrl.clone();
  url.pathname = `/${locale}${pathname === '/' ? '' : pathname}`;
  return NextResponse.rewrite(url);
}

function proxyApi(request: NextRequest): NextResponse {
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

export const config = {
  // หน้าเว็บทุกหน้า (ยกเว้นไฟล์ static / ไฟล์ที่มีนามสกุล / service worker) + proxy /api/v1
  matcher: ['/api/v1/:path*', '/((?!api|_next|_vercel|icons|.*\\..*).*)'],
};
