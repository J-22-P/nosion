import { defineConfig, devices } from '@playwright/test';

/**
 * สอง project แยกกันตามสิ่งที่ต้องมี
 *
 *  smoke — ใช้ API + DB จริง (ยก docker-compose ก่อน) · ทดสอบ flow ปลายทางถึงปลายทาง
 *  ui    — API ปลอมด้วย page.route · visual regression + axe · ต้องการแค่ web ที่ build แล้ว
 *
 * ถ้าไม่ได้ตั้ง E2E_BASE_URL จะรัน `pnpm start` ให้เอง (ต้อง `pnpm build` ก่อน)
 */
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['html', { open: 'never' }], ['github']] : 'list',
  // baseline แยกตาม platform — ภาพจาก macOS กับ Linux เทียบกันไม่ได้
  snapshotPathTemplate: '{testDir}/__screenshots__/{testFileName}/{arg}-{platform}{ext}',
  expect: {
    toHaveScreenshot: {
      animations: 'disabled',
      caret: 'hide',
      // เกิน 0.2% ของพิกเซล = หน้าตาเปลี่ยนจริง (สเปก Phase 8)
      maxDiffPixelRatio: 0.002,
      // พิกเซลไหน "ต่าง" — ค่าเริ่มต้น 0.2 หยาบเกิน: chip สีจางที่เพิ่มใหม่นับได้แค่ ~80 พิกเซล
      // วัดจริง (Phase 8 ขั้น 1): ภาพจาก runner สองรอบไม่ต่างกันเลยแม้ที่ 0.02 → 0.05 เผื่อไว้ยังไม่มี noise
      threshold: 0.05,
    },
  },
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'smoke',
      testMatch: /smoke\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'ui',
      testMatch: /(visual|a11y)\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        locale: 'th-TH',
        timezoneId: 'Asia/Bangkok',
      },
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'pnpm start',
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
