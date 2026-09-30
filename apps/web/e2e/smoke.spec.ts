import { expect, test } from '@playwright/test';

/**
 * E2E flow แรกของโปรเจกต์: กดปุ่มเดียวจากหน้าแรกต้องเข้าใช้งานได้จริง
 * (ต้องมี API + DB ทำงานอยู่ — CI ยก docker-compose ขึ้นก่อนรัน)
 */
test('ผู้เข้าชมกด "ลองใช้ทันที" แล้วสร้างงานใหม่ได้', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('ต่อโมดูลเพิ่มได้');

  await page.getByRole('button', { name: /ลองใช้ทันที/ }).click();
  await page.waitForURL('**/tasks');

  const title = `งานทดสอบ ${Date.now()}`;
  await page.getByLabel('ชื่องานใหม่').fill(title);
  await page.getByRole('button', { name: /สร้างงาน/ }).click();

  await expect(page.getByText(title)).toBeVisible();
});

test('หน้าแรกมี landmark หลักและโฟกัสด้วยคีย์บอร์ดได้', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('main')).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.locator(':focus')).toBeVisible();
});
