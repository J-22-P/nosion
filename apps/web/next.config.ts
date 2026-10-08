import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // standalone ทำให้ image production มีแค่ไฟล์ที่ใช้จริง (เล็กลงราว 5 เท่า)
  output: 'standalone',
  // ชี้ราก monorepo เพื่อให้ tracing เก็บไฟล์จาก workspace package มาด้วย
  outputFileTracingRoot: process.cwd() + '/../..',
  // ใช้ซอร์สโดยตรงจาก workspace package — เปลี่ยน contract แล้วเห็นผลทันทีตอน dev
  transpilePackages: ['@nosion/ui', '@nosion/contracts', '@nosion/core'],
  /**
   * staging (Vercel): web กับ API เป็นคนละ project/โดเมน → proxy /api/v1 ผ่านโดเมนของ web
   * refresh cookie (SameSite=Strict, path /api/v1/auth) จึงเป็น first-party · ไม่ต้องเปิด CORS ข้ามโดเมน
   * ตั้ง API_PROXY_TARGET=https://<api>.vercel.app และ NEXT_PUBLIC_API_URL="" (เรียก path สัมพัทธ์)
   * local / docker ไม่ตั้ง → ไม่มี rewrite เรียก API ตรงเหมือนเดิม
   */
  async rewrites() {
    const target = process.env.API_PROXY_TARGET;
    return target ? [{ source: '/api/v1/:path*', destination: `${target}/api/v1/:path*` }] : [];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
    ];
  },
};

export default nextConfig;
