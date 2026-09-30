#!/usr/bin/env node
/**
 * สร้างไอคอน PNG ทุกขนาดจากโลโก้ SVG (สเปก 8.7.7)
 *
 *   pnpm --filter @nosion/web icons
 *
 * ทำไมต้อง commit PNG ที่ generate แล้ว: iOS (apple-touch-icon) และ PWA manifest บางแพลตฟอร์ม
 * ไม่รับ SVG · ไฟล์ชุดนี้เปลี่ยนเฉพาะตอนเปลี่ยนโลโก้ จึงไม่คุ้มที่จะ generate ทุก build
 */
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const web = join(dirname(fileURLToPath(import.meta.url)), '..');
const N = 'M32 72V28h7.5l21.5 30.5V28H68v44h-7.5L39 41.5V72z';

/** ไอคอนปกติ: สี่เหลี่ยมมน rx 24% + ขอบ #27272a — แบบเดียวกับ app/icon.svg */
const rounded = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect x="1" y="1" width="98" height="98" rx="24" fill="#000" stroke="#27272a" stroke-width="2"/>
  <path d="${N}" fill="#fff"/></svg>`;

/**
 * maskable / apple: พื้นดำเต็มกรอบ ไม่มีมุมมน — ระบบปฏิบัติการตัดรูปทรงเอง
 * (Android ตัดเป็นวงกลม/squircle, iOS ตัดมุมมน) ถ้าใส่มุมมนเองจะได้ขอบขาวที่มุม
 * ตัว N ย่อเหลือ 80% ให้อยู่ใน safe zone (วงกลมรัศมี 40% จากกึ่งกลาง)
 */
const fullBleed = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" fill="#000"/>
  <g transform="translate(10 10) scale(0.8)"><path d="${N}" fill="#fff"/></g></svg>`;

const outputs = [
  { svg: rounded, size: 192, file: 'public/icons/icon-192.png' },
  { svg: rounded, size: 512, file: 'public/icons/icon-512.png' },
  { svg: fullBleed, size: 512, file: 'public/icons/maskable-512.png' },
  { svg: fullBleed, size: 180, file: 'src/app/apple-icon.png' },
];

for (const { svg, size, file } of outputs) {
  const target = join(web, file);
  mkdirSync(dirname(target), { recursive: true });
  await sharp(Buffer.from(svg), { density: 72 * (size / 100) * 4 })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toFile(target);
  console.log(`✓ ${file} (${size}×${size})`);
}
