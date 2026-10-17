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
 * วัด LH_RUNS รอบ (ค่าเริ่มต้น 3) แล้วตัดสินด้วยมัธยฐาน — perf ของ Lighthouse แกว่งตามโหลดของเครื่องได้ถึง ±30
 * ผล: ตารางคะแนนใน stdout + รายงาน HTML ของรอบสุดท้ายที่ lighthouse-report/ · exit 1 ถ้ามัธยฐานหมวดไหนต่ำกว่าเกณฑ์
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

const RUNS = Number(process.env.LH_RUNS ?? 3);
const CATS = ['performance', 'accessibility', 'best-practices', 'seo'];
const config = FORM_FACTOR === 'desktop' ? desktopConfig : undefined;

const browser = await puppeteer.launch({
  executablePath: chromium.executablePath(),
  headless: true,
  args: ['--no-sandbox'],
});

// ล็อกอิน demo ครั้งเดียว (โควตา 5 ครั้ง/ชม./IP) แล้ววัดหน้าแอปซ้ำทุกรอบด้วย session เดิม
const appPage = await browser.newPage();
await appPage.goto(`${BASE}/`);
const demo = await appPage.waitForSelector('::-p-text(ลองใช้ทันที)');
await demo.click();
await appPage.waitForFunction(() => location.pathname === '/tasks', { timeout: 30_000 });

/** lhr ของทุกหน้า ทุกรอบ — perf แกว่งตามโหลดเครื่อง (วัดจริง ±30 แต้ม) จึงตัดสินด้วยมัธยฐาน */
const byPage = new Map(PAGES.map((p) => [p, []]));
mkdirSync(OUT, { recursive: true });

for (let run = 1; run <= RUNS; run++) {
  // หน้าสาธารณะใน context ใหม่ (ยังไม่ล็อกอิน — /login ของคนที่ล็อกอินแล้วจะพาเข้าแอป)
  const guest = await browser.createBrowserContext();
  const publicFlow = await startFlow(await guest.newPage(), {
    name: `NOSION · ${FORM_FACTOR} · สาธารณะ`,
    config,
  });
  for (const path of PAGES.slice(0, 2)) await publicFlow.navigate(`${BASE}${path}`, { name: path });
  // tab ใหม่ทุกรอบ (cookie ของ context เดิม) — ใช้ tab เดียววัดหลายสิบหน้าแล้ว buffer ของ tracing/หน่วยความจำ
  // สะสมจนคะแนนตกทุกรอบ (100 → 90 → 82) ซึ่งไม่ใช่สิ่งที่ผู้ใช้เจอ (วัดซ้ำด้วย longtask ในหน้าเดียวกัน: ไม่โต)
  const tab = await browser.newPage();
  const appFlow = await startFlow(tab, {
    name: `NOSION · ${FORM_FACTOR} · แอป`,
    config,
    flags: { disableStorageReset: true },
  });
  for (const path of PAGES.slice(2)) await appFlow.navigate(`${BASE}${path}`, { name: path });

  for (const flow of [publicFlow, appFlow]) {
    for (const step of (await flow.createFlowResult()).steps) byPage.get(step.name).push(step.lhr);
  }
  if (run === RUNS) {
    writeFileSync(`${OUT}/flow-${FORM_FACTOR}-public.html`, await publicFlow.generateReport());
    writeFileSync(`${OUT}/flow-${FORM_FACTOR}-app.html`, await appFlow.generateReport());
  }
  await guest.close();
  await tab.close();
  console.log(`รอบ ${run}/${RUNS} เสร็จ`);
}
await browser.close();

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};
const score = (lhr, c) => Math.round((lhr.categories[c]?.score ?? 0) * 100);

let failed = false;
const rows = [];
for (const [path, lhrs] of byPage) {
  // ยืนยันว่าวัดหน้าที่ตั้งใจ — หน้าแอปที่หลุดไป /login แปลว่าวัดผิดหน้า
  const landed = [...new Set(lhrs.map((l) => new URL(l.finalDisplayedUrl).pathname))].join(',');
  if (landed !== path) failed = true;
  const row = { page: path, landed };
  for (const c of CATS) {
    const m = median(lhrs.map((l) => score(l, c)));
    if (m < MIN) failed = true;
    row[c] = c === 'performance' ? `${m} (${lhrs.map((l) => score(l, c)).join('/')})` : m;
  }
  rows.push(row);
}
console.log(`${FORM_FACTOR} · มัธยฐานของ ${RUNS} รอบ (perf ในวงเล็บ = ทุกรอบ) · เกณฑ์ ${MIN}`);
console.table(rows);

// audit ที่ทำให้ตก (จากรอบที่คะแนนเท่ามัธยฐาน)
for (const [path, lhrs] of byPage) {
  for (const c of CATS) {
    const m = median(lhrs.map((l) => score(l, c)));
    if (m >= MIN) continue;
    const lhr = lhrs.find((l) => score(l, c) === m);
    const misses = lhr.categories[c].auditRefs
      .map((r) => lhr.audits[r.id])
      .filter((a) => a && a.score !== null && a.score < 0.9 && a.scoreDisplayMode !== 'informative')
      .map((a) => `${a.id} (${a.displayValue ?? Math.round(a.score * 100)})`);
    console.log(`✗ ${path} · ${c} ${m} → ${misses.join(', ')}`);
  }
}
process.exit(failed ? 1 : 0);
