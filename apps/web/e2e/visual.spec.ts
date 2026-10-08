import { settle, test, expect, type Theme } from './support/ui-test';

/**
 * Visual regression baseline (สเปก Phase 2a: "Playwright screenshot ของ Tasks ทั้ง 2 ธีม × 2 ขนาดจอ")
 *
 * ภาพ baseline ต้องสร้างบน Linux ใน Docker image ของ Playwright เท่านั้น
 * (ฟอนต์และการ anti-alias ต่างกันระหว่าง macOS/Linux → เทียบข้ามระบบไม่ได้)
 *   สร้าง/อัปเดต:  pnpm --filter @nosion/web test:ui:docker
 *   CI:            รันด้วย --update-snapshots=missing และอัปโหลดภาพเป็น artifact
 */

const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
} as const;

const THEMES: Theme[] = ['light', 'dark'];

/**
 * รอ "หน้าพร้อม" นานกว่าค่าเริ่มต้น 5 s — โหลดแรกของแต่ละหน้าใน container เย็น ๆ ที่รันหลาย worker พร้อมกัน
 * (หน้า Expenses ยิง API 5 ตัวพร้อมกัน) เคยเกิน 5 s แล้ว retry ผ่าน · ใช้กับการรอข้อมูลเท่านั้น ไม่ใช่การเทียบภาพ
 */
const READY = { timeout: 15_000 };

for (const theme of THEMES) {
  for (const [device, viewport] of Object.entries(VIEWPORTS)) {
    test.describe(`${theme} · ${device}`, () => {
      test.use({ colorScheme: theme, viewport });

      test('Tasks', async ({ page }) => {
        await page.goto('/tasks');
        await expect(page.getByText('Re-architect Auth Token refresh flow')).toBeVisible(READY);
        // การ์ด Focus มี 2 ชุดใน DOM (มือถือ lg:hidden / desktop ใน sidebar) — เลือกตัวที่มองเห็น
        await expect(page.getByText('2h 45m').filter({ visible: true })).toBeVisible();
        await settle(page);
        await expect(page).toHaveScreenshot(`tasks-${theme}-${device}.png`, { fullPage: true });
      });

      test('Today', async ({ page }) => {
        await page.goto('/today');
        await expect(page.getByRole('heading', { name: 'สวัสดีตอนบ่าย Jay' })).toBeVisible(READY);
        await settle(page);
        await expect(page).toHaveScreenshot(`today-${theme}-${device}.png`, { fullPage: true });
      });

      test('Expenses', async ({ page }) => {
        await page.goto('/expenses');
        await expect(
          page.getByText('Craft Specialty Coffee').filter({ visible: true }),
        ).toBeVisible(READY);
        await expect(page.getByText('AIS Fibre')).toBeVisible();
        await settle(page);
        await expect(page).toHaveScreenshot(`expenses-${theme}-${device}.png`, { fullPage: true });
      });

      test('Analytics', async ({ page }) => {
        await page.goto('/expenses/analytics');
        await expect(page.getByRole('cell', { name: '฿3,820' })).toBeVisible(READY);
        await settle(page);
        await expect(page).toHaveScreenshot(`analytics-${theme}-${device}.png`, { fullPage: true });
      });

      test('Login', async ({ page }) => {
        await page.goto('/login');
        await expect(page.getByRole('heading', { name: 'เข้าสู่ระบบ' })).toBeVisible(READY);
        await settle(page);
        await expect(page).toHaveScreenshot(`login-${theme}-${device}.png`, { fullPage: true });
      });
    });
  }
}
