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

for (const theme of THEMES) {
  for (const [device, viewport] of Object.entries(VIEWPORTS)) {
    test.describe(`${theme} · ${device}`, () => {
      test.use({ colorScheme: theme, viewport });

      test('Tasks', async ({ page }) => {
        await page.goto('/tasks');
        await expect(page.getByText('Re-architect Auth Token refresh flow')).toBeVisible();
        await expect(page.getByText('2h 45m')).toBeVisible();
        await settle(page);
        await expect(page).toHaveScreenshot(`tasks-${theme}-${device}.png`, { fullPage: true });
      });

      test('Login', async ({ page }) => {
        await page.goto('/login');
        await expect(page.getByRole('heading', { name: 'เข้าสู่ระบบ' })).toBeVisible();
        await settle(page);
        await expect(page).toHaveScreenshot(`login-${theme}-${device}.png`, { fullPage: true });
      });
    });
  }
}
