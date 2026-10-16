/**
 * Lighthouse ทุกหน้าหลัก (สเปก Phase 8: ≥ 90 ทุกหมวด ทุกหน้าหลัก)
 *
 *   node scripts/lighthouse.mjs                       # staging (ค่าเริ่มต้น)
 *   LH_BASE_URL=http://localhost:3000 node scripts/lighthouse.mjs
 *   LH_FORM_FACTOR=desktop node scripts/lighthouse.mjs
 *
 * หน้าแอปต้องล็อกอิน → ใช้ user flow: เปิดหน้าแรก กด "ลองใช้ทันที" (demo) ครั้งเดียว แล้ววัดทีละหน้า
 * โดยไม่ล้าง storage ระหว่างหน้า (refresh cookie ต้องอยู่ ไม่งั้นทุกหน้าโดนพาไป /login)
 * demo login จำกัด 5 ครั้ง/ชม./IP — สคริปต์นี้ใช้ 1 ครั้งต่อรอบ
 *
 * ผล: ตารางคะแนนใน stdout + รายงาน HTML ที่ lighthouse-report/ · exit 1 ถ้ามีหมวดไหนต่ำกว่าเกณฑ์
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { startFlow, desktopConfig } from 'lighthouse';
import puppeteer from 'puppeteer-core';

const BASE = (process.env.LH_BASE_URL ?? 'https://nosion-staging-web.vercel.app').replace(
  /\/$/,
  '',
);
const FORM_FACTOR = process.env.LH_FORM_FACTOR === 'desktop' ? 'desktop' : 'mobile';
const MIN = Number(process.env.LH_MIN_SCORE ?? 90);
const PAGES = ['/', '/login', '/today', '/tasks', '/expenses', '/calendar', '/habits', '/review'];
const OUT = 'lighthouse-report';

const browser = await puppeteer.launch({
  executablePath: chromium.executablePath(),
  headless: true,
  args: ['--no-sandbox'],
});
const page = await browser.newPage();

const flow = await startFlow(page, {
  name: `NOSION · ${FORM_FACTOR}`,
  config: FORM_FACTOR === 'desktop' ? desktopConfig : undefined,
  flags: { disableStorageReset: true },
});

// หน้าสาธารณะก่อน (ยังไม่ล็อกอิน)
await flow.navigate(`${BASE}/`, { name: '/' });
await flow.navigate(`${BASE}/login`, { name: '/login' });

// ล็อกอิน demo — ไม่วัดขั้นนี้
await page.goto(`${BASE}/`);
const demo = await page.waitForSelector('::-p-text(ลองใช้ทันที)');
await demo.click();
await page.waitForFunction(() => location.pathname === '/tasks', { timeout: 30_000 });

for (const path of PAGES.slice(2)) {
  await flow.navigate(`${BASE}${path}`, { name: path });
}

const result = await flow.createFlowResult();
await browser.close();

mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}/flow-${FORM_FACTOR}.html`, await flow.generateReport());

const CATS = ['performance', 'accessibility', 'best-practices', 'seo'];
let failed = false;
const rows = result.steps.map((step) => {
  const lhr = step.lhr;
  const scores = CATS.map((c) => Math.round((lhr.categories[c]?.score ?? 0) * 100));
  if (scores.some((s) => s < MIN)) failed = true;
  // ยืนยันว่าวัดหน้าที่ตั้งใจ — หน้าแอปที่หลุดไป /login แปลว่าวัดผิดหน้า
  const landed = new URL(lhr.finalDisplayedUrl).pathname;
  return { page: step.name, landed, ...Object.fromEntries(CATS.map((c, i) => [c, scores[i]])) };
});
console.table(rows);
for (const step of result.steps) {
  const lhr = step.lhr;
  for (const c of CATS) {
    const cat = lhr.categories[c];
    if (!cat || cat.score * 100 >= MIN) continue;
    const misses = cat.auditRefs
      .map((r) => lhr.audits[r.id])
      .filter((a) => a && a.score !== null && a.score < 0.9 && a.scoreDisplayMode !== 'informative')
      .map((a) => `${a.id} (${a.displayValue ?? Math.round(a.score * 100)})`);
    console.log(`✗ ${step.name} · ${c} ${Math.round(cat.score * 100)} → ${misses.join(', ')}`);
  }
}
process.exit(failed ? 1 : 0);
