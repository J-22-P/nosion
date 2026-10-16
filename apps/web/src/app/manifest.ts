import type { MetadataRoute } from 'next';

/**
 * Web App Manifest (สเปก 8.6 / 8.7.7) — Next เสิร์ฟที่ /manifest.webmanifest และใส่ <link rel="manifest"> ให้เอง
 *
 * ชื่อ ไอคอน สี สำหรับ "เพิ่มลงหน้าจอหลัก" + service worker ที่แคชหน้าไว้ใช้ออฟไลน์ (Phase 7)
 * → ติดตั้งเป็นแอปได้ (Playwright ตรวจด้วย Page.getInstallabilityErrors ของ Chromium)
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'NOSION — Workspace OS',
    short_name: 'NOSION',
    description: 'งาน การเงิน ออกกำลังกาย และนิสัย ในที่เดียว',
    lang: 'th',
    start_url: '/today',
    scope: '/',
    display: 'standalone',
    // สีพื้นของ splash screen ตอนเปิดแอป — ดำตามโลโก้ (ธีมจริงมาหลังโหลด)
    background_color: '#000000',
    theme_color: '#000000',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
