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
