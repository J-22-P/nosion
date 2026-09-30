import { test as base, expect } from '@playwright/test';
import { mockApi } from './mock-api';
import { NOW } from './mock-data';

export type Theme = 'light' | 'dark';

/**
 * test ที่เตรียมทุกอย่างให้หน้า "นิ่ง" ก่อนถ่ายภาพ / ตรวจ a11y
 * - API ปลอม (mock-api.ts) · นาฬิกาตรึงที่ NOW · โซนเวลาไทย (ตั้งใน playwright.config)
 * - ธีมมาจาก prefers-color-scheme ผ่าน test.use({ colorScheme }) (ค่าเริ่มต้นของแอปคือ system)
 */
export const test = base.extend<{ mocked: void }>({
  mocked: [
    async ({ page }, use) => {
      await page.clock.setFixedTime(NOW);
      await mockApi(page);
      await use();
    },
    { auto: true },
  ],
});

export { expect };

/** รอจนหน้าพร้อม: ฟอนต์โหลดครบ และไม่มี skeleton ค้าง */
export async function settle(page: import('@playwright/test').Page) {
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('.animate-pulse')).toHaveCount(0);
}
