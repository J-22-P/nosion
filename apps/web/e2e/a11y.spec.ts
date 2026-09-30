import AxeBuilder from '@axe-core/playwright';
import { settle, test, expect, type Theme } from './support/ui-test';

/**
 * ตรวจ accessibility อัตโนมัติด้วย axe-core (สเปก 8.8 · DoD Phase 2: "axe 0 serious ทั้ง 2 ธีม")
 *
 * รันแต่ละหน้าซ้ำทั้งธีมสว่างและมืด เพราะ contrast ที่ผ่านในธีมหนึ่งอาจตกในอีกธีม
 * ล้มเฉพาะ impact serious/critical — minor/moderate รายงานไว้ใน attachment ให้ตามแก้
 * (axe จับปัญหาได้ราว 30–40% ที่เหลือต้องลองด้วยคีย์บอร์ด + screen reader — บท learn/11)
 */

const PAGES = [
  { path: '/login', ready: 'เข้าสู่ระบบ' },
  { path: '/register', ready: 'สร้างบัญชีใหม่' },
  { path: '/tasks', ready: 'Re-architect Auth Token refresh flow' },
  { path: '/hub', ready: 'Workouts' },
  { path: '/settings', ready: 'การแสดงผล' },
] as const;

const THEMES: Theme[] = ['light', 'dark'];

for (const theme of THEMES) {
  test.describe(`axe · ${theme}`, () => {
    test.use({ colorScheme: theme });

    for (const { path, ready } of PAGES) {
      test(path, async ({ page }, testInfo) => {
        await page.goto(path);
        await expect(page.getByText(ready).first()).toBeVisible();
        await settle(page);

        const results = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
          .analyze();

        await testInfo.attach('axe-results.json', {
          body: JSON.stringify(results.violations, null, 2),
          contentType: 'application/json',
        });

        const blocking = results.violations
          .filter((v) => v.impact === 'serious' || v.impact === 'critical')
          .map((v) => ({
            rule: v.id,
            impact: v.impact,
            help: v.help,
            targets: v.nodes.slice(0, 5).map((n) => n.target.join(' ')),
          }));

        expect(blocking, `axe พบปัญหาร้ายแรงบน ${path} (${theme})`).toEqual([]);
      });
    }
  });
}
