import AxeBuilder from '@axe-core/playwright';
import { SETTINGS } from './support/mock-data';
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
  { path: '/today', ready: 'สวัสดีตอนบ่าย Jay' },
  { path: '/tasks', ready: 'Re-architect Auth Token refresh flow' },
  { path: '/expenses', ready: 'AIS Fibre' },
  { path: '/expenses/analytics', ready: 'สัดส่วนตามหมวดหมู่' },
  { path: '/calendar', ready: 'Quick Snapshot' },
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
        // 15 s: โหลดแรกใน container ที่รันหลาย worker พร้อมกันเคยเกิน 5 s (ดู visual.spec.ts)
        await expect(page.getByText(ready).first()).toBeVisible({ timeout: 15_000 });
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

test.describe('Today · standup sheet', () => {
  test('กด s เปิด sheet (dialog) ที่มีชื่อ · โฟกัสอยู่ใน dialog · axe ผ่าน · Esc ปิดแล้ว URL กลับ', async ({
    page,
  }) => {
    await page.goto('/today');
    await expect(page.getByRole('heading', { name: 'สวัสดีตอนบ่าย Jay' })).toBeVisible({
      timeout: 15_000,
    });
    await page.keyboard.press('s');
    const dialog = page.getByRole('dialog', { name: 'Standup วันนี้' });
    await expect(dialog).toBeVisible();
    await expect(page).toHaveURL(/standup=1/);
    await expect(dialog.getByRole('textbox', { name: 'Standup markdown' })).toHaveValue(
      /\*\*Blocked\*\*\n- ไม่มี/,
    );
    // showModal() ย้ายโฟกัสเข้า dialog เอง
    expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true);

    const results = await new AxeBuilder({ page }).include('dialog').analyze();
    expect(
      results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical'),
    ).toEqual([]);

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(page).not.toHaveURL(/standup=1/);
  });
});

test.describe('Expenses · เพิ่มรอบบิลใหม่ (Phase 3)', () => {
  for (const theme of THEMES) {
    test(`DoD: บิลทุกวันที่ 31 → preview เดือน ก.พ. เป็นวันที่ 28 · บันทึกส่ง rrule ถูก · axe ผ่าน (${theme})`, async ({
      page,
    }) => {
      test.slow();
      await page.emulateMedia({ colorScheme: theme });
      let created: Record<string, unknown> | null = null;
      // route ที่ลงทะเบียนทีหลังถูกเลือกก่อน — ดักเฉพาะการสร้างกฎเพื่อตรวจ body
      await page.route('**/api/v1/recurrence-rules', async (route) => {
        created = route.request().postDataJSON() as Record<string, unknown>;
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ id: 'rule-new', ...created }),
        });
      });

      await page.goto('/expenses');
      await expect(page.getByText('AIS Fibre').first()).toBeVisible({ timeout: 15_000 });
      await page.getByRole('button', { name: 'เพิ่มรอบบิลใหม่' }).click();

      const dialog = page.getByRole('dialog', { name: 'เพิ่มรอบบิลใหม่' });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByLabel('ชื่อบิล')).toBeFocused();

      // ส่งทั้งที่ยังว่าง → บอกข้อผิดพลาด ไม่ยิง API
      await dialog.getByRole('button', { name: 'ตั้งรอบบิล' }).click();
      await expect(dialog.getByText('ใส่ชื่อบิล')).toBeVisible();
      expect(created).toBeNull();

      await dialog.getByLabel('ชื่อบิล').fill('ค่าเน็ต');
      await dialog.getByLabel('จำนวนเงิน (บาท)').fill('799');
      await dialog.getByLabel('เริ่มวันที่').fill('2027-01-31');
      await expect(dialog.getByLabel('วันที่ของเดือน')).toHaveValue('31');
      await expect(
        dialog.getByText('เดือนที่ไม่มีวันที่ 31 จะใช้วันสุดท้ายของเดือนแทน'),
      ).toBeVisible();

      const preview = dialog.getByRole('region', { name: '10 รอบถัดไป' });
      await expect(preview.getByRole('listitem')).toHaveCount(10);
      await expect(preview.getByRole('listitem').nth(1)).toContainText('28 ก.พ. 2027');
      await expect(preview).toContainText('RRULE:FREQ=MONTHLY;BYMONTHDAY=31');

      const results = await new AxeBuilder({ page }).include('dialog').analyze();
      expect(
        results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical'),
      ).toEqual([]);

      await dialog.getByRole('button', { name: 'ตั้งรอบบิล' }).click();
      await expect(dialog).toBeHidden();
      expect(created).toMatchObject({
        rrule: 'FREQ=MONTHLY;BYMONTHDAY=31',
        startsAt: '2027-01-31',
        endType: 'never',
        template: {
          module: 'expense',
          title: 'ค่าเน็ต',
          payload: { amountMinor: 79_900, isBill: true, costType: 'fixed' },
          // ค่าเริ่มต้น "ล่วงหน้า 1 วัน (09:00)" = −1440 + 540 นาที (DoD Phase 4)
          reminders: [{ channel: 'push', offsetMinutes: -900 }],
        },
      });
    });
  }

  test('รายสัปดาห์: เลือกวันแล้ว preview ตาม · กดวันสุดท้ายออกไม่ได้', async ({ page }) => {
    await page.goto('/expenses');
    await expect(page.getByText('AIS Fibre').first()).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: 'เพิ่มรอบบิลใหม่' }).click();
    const dialog = page.getByRole('dialog', { name: 'เพิ่มรอบบิลใหม่' });
    await dialog.getByLabel('เริ่มวันที่').fill('2027-02-01'); // วันจันทร์
    await dialog.getByRole('radio', { name: 'รายสัปดาห์' }).click();

    const monday = dialog.getByRole('button', { name: 'จันทร์' });
    await expect(monday).toHaveAttribute('aria-pressed', 'true');
    await monday.click(); // วันเดียวที่เหลือ — กดออกไม่ได้
    await expect(monday).toHaveAttribute('aria-pressed', 'true');

    await dialog.getByRole('button', { name: 'พฤหัสบดี' }).click();
    const preview = dialog.getByRole('region', { name: '10 รอบถัดไป' });
    await expect(preview).toContainText('RRULE:FREQ=WEEKLY;BYDAY=MO,TH');
    await expect(preview.getByRole('listitem').nth(1)).toContainText('4 ก.พ. 2027');
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });
});

test.describe('Today · Materialize Recurrence (Phase 3)', () => {
  test('ปุ่มใช้ได้แล้ว → เรียก API และแจ้งผล', async ({ page }) => {
    await page.goto('/today');
    await expect(page.getByRole('heading', { name: 'สวัสดีตอนบ่าย Jay' })).toBeVisible({
      timeout: 15_000,
    });
    const button = page.getByRole('button', { name: /Materialize Recurrence/ });
    await expect(button).toBeEnabled();
    await button.click();
    await expect(page.getByText('สร้างรายการใหม่ 3 รายการ')).toBeVisible();
  });
});

test.describe('Settings · การแจ้งเตือน (Phase 4)', () => {
  test('ยังไม่เคยถามสิทธิ์ → มีปุ่ม "เปิดการแจ้งเตือน"', async ({ page }) => {
    // headless Chromium ตอบ denied เสมอ (grantPermissions ไม่มีผลกับ Notification) → จำลองสถานะครั้งแรกของผู้ใช้จริง
    await page.addInitScript(() => {
      Object.defineProperty(Notification, 'permission', { get: () => 'default' });
    });
    await page.goto('/settings');
    await expect(page.getByRole('button', { name: 'เปิดการแจ้งเตือน' })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText('เปิดเพื่อรับการเตือนบนเครื่องนี้')).toBeVisible();
  });

  test('เบราว์เซอร์บล็อกไว้ → ไม่มีปุ่ม และบอกวิธีเปิดสิทธิ์', async ({ page }) => {
    // headless Chromium ปฏิเสธการแจ้งเตือนเป็นค่าเริ่มต้น
    await page.goto('/settings');
    await expect(page.getByText('เบราว์เซอร์บล็อกการแจ้งเตือนของเว็บนี้ไว้')).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole('button', { name: 'เปิดการแจ้งเตือน' })).toHaveCount(0);
  });
});

test.describe('Settings · ห้ามรบกวนและสรุปรายวัน (Phase 4)', () => {
  test('แก้เวลาสรุปรายวัน → ปุ่มบันทึกเปิด · PATCH เฉพาะค่าที่ตั้ง · เวลาเริ่ม=จบถูกกันไว้', async ({
    page,
  }) => {
    let patched: Record<string, unknown> | null = null;
    await page.route('**/api/v1/me/settings', async (route) => {
      patched = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...SETTINGS, ...patched }),
      });
    });
    await page.goto('/settings');
    const save = page.getByRole('button', { name: 'บันทึก', exact: true });
    await expect(save).toBeDisabled({ timeout: 15_000 });

    await page.getByLabel('ถึง').fill('22:00'); // เท่ากับเวลาเริ่ม
    await expect(page.getByText('เวลาเริ่มกับเวลาจบต้องต่างกัน')).toBeVisible();
    await expect(save).toBeDisabled();
    await page.getByLabel('ถึง').fill('06:30');

    await page.getByLabel('ส่งเวลา').fill('06:45');
    await expect(save).toBeEnabled();
    await save.click();
    await expect(page.getByText('บันทึกการตั้งค่าแล้ว')).toBeVisible();
    expect(patched).toEqual({
      quietHoursEnabled: true,
      quietHoursStart: '22:00',
      quietHoursEnd: '06:30',
      dailyDigestEnabled: true,
      dailyDigestTime: '06:45',
    });
    await expect(save).toBeDisabled(); // บันทึกแล้ว = ไม่มีอะไรค้าง

    // ข้าม toast ที่กำลังจางเข้า — axe วัด contrast ระหว่าง animation (opacity ยังไม่เต็ม) ได้ 1.33 ซึ่งไม่ใช่สีจริง
    const results = await new AxeBuilder({ page }).exclude('[data-sonner-toaster]').analyze();
    expect(
      results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical'),
    ).toEqual([]);
  });
});

test.describe('Calendar (Phase 5)', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('เลือกวัน → day panel + URL · ติ๊กงานจาก panel เรียก complete · กรองโมดูลด้วย chip', async ({
    page,
  }) => {
    const completed: string[] = [];
    page.on('request', (r) => {
      if (r.method() === 'POST' && r.url().includes('/complete')) completed.push(r.url());
    });
    await page.goto('/calendar');
    await expect(page.getByText('Quick Snapshot')).toBeVisible({ timeout: 15_000 });

    // วันนี้ (30 ก.ย.) ถูกเลือกไว้ตั้งแต่แรก — ติ๊ก "Fix login redirect bug"
    await page.getByRole('checkbox', { name: 'ทำเสร็จ: Fix login redirect bug' }).click();
    await expect.poll(() => completed).toEqual([expect.stringContaining('/entries/t_c4/complete')]);

    // เลือกวันที่ 5 ต.ค. → panel แสดงบิล TrueMove + ปุ่ม "จ่ายแล้ว" มาจาก actions ของโมดูล
    await page.getByRole('button', { name: /^วันจันทร์ 5 ตุลาคม 2026/ }).click();
    await expect(page).toHaveURL(/date=2026-10-05/);
    await expect(page.getByRole('heading', { name: 'วันจันทร์ 5 ตุลาคม 2026' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'จ่ายแล้ว' })).toBeVisible();

    // กรองเฉพาะงาน → บิลหายจากปฏิทิน · chip ยังบอกจำนวนของการเงิน (grid 28 ก.ย.–8 พ.ย. รวมรอบ projected)
    await page.getByRole('button', { name: /^งาน \d+$/ }).click();
    await expect(page).toHaveURL(/module=task/);
    await expect(page.getByText('TrueMove H · ฿599.00')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^การเงิน 3$/ })).toBeVisible();
  });

  test('Subscribe iCal: แสดงลิงก์ · ปุ่มสร้างใหม่ต้องกดยืนยัน', async ({ page }) => {
    let rotated = 0;
    await page.route('**/api/v1/calendar/feed/rotate', async (route) => {
      rotated += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          url: 'https://api.nosion.test/api/v1/calendar/new-token-zzzzzzzzzzzzzzzz.ics',
          webcalUrl: 'webcal://api.nosion.test/api/v1/calendar/new-token-zzzzzzzzzzzzzzzz.ics',
        }),
      });
    });
    await page.goto('/calendar');
    await page.getByRole('button', { name: 'Subscribe iCal' }).click({ timeout: 15_000 });
    const dialog = page.getByRole('dialog', { name: 'Subscribe ปฏิทิน (iCal)' });
    await expect(dialog.getByLabel('ลิงก์ iCal')).toHaveValue(/test-feed-token/);

    await dialog.getByRole('button', { name: 'สร้างลิงก์ใหม่' }).click();
    expect(rotated).toBe(0);
    await dialog.getByRole('button', { name: 'ยืนยัน: ยกเลิกลิงก์เดิม' }).click();
    await expect(dialog.getByLabel('ลิงก์ iCal')).toHaveValue(/new-token/);
    expect(rotated).toBe(1);
  });
});

test.describe('Calendar · ลากเปลี่ยนวัน (Phase 5 ขั้น 6)', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  const cell = (page: import('@playwright/test').Page, label: RegExp) =>
    page.getByRole('button', { name: label });

  test('ลากงานไปวันอื่น → ย้ายทันที (ก่อน server ตอบ) + PATCH คงเวลาเดิม พร้อม version', async ({
    page,
  }) => {
    let body: Record<string, unknown> | null = null;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    await page.route('**/api/v1/entries/t_c5', async (route) => {
      body = route.request().postDataJSON() as Record<string, unknown>;
      await gate; // ค้างคำตอบไว้ — ตรวจว่า UI ย้ายให้เห็นก่อน (optimistic)
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"id":"t_c5"}' });
    });
    await page.goto('/calendar');
    const item = page.getByText('Update API docs').filter({ visible: true }).first();
    await expect(item).toBeVisible({ timeout: 15_000 });

    await item.dragTo(cell(page, /^วันศุกร์ 2 ตุลาคม 2026/));
    await expect
      .poll(() => body)
      .toEqual({
        occurredAt: '2026-10-02T07:30:00.000Z', // 14:30 เวลาไทยเหมือนเดิม
        isAllDay: false,
        version: 3,
      });
    await expect(cell(page, /^วันศุกร์ 2 ตุลาคม 2026 · 1 รายการ/)).toBeVisible();
    await expect(cell(page, /^วันพุธ 30 กันยายน 2026 · 3 รายการ/)).toBeVisible();
    release();
    await expect(page.getByText('ย้ายวันแล้ว')).toBeVisible();
  });

  test('server ตอบ 409 → ย้อนกลับที่เดิมและบอกผู้ใช้', async ({ page }) => {
    await page.route('**/api/v1/entries/t_c5', (route) =>
      route.fulfill({
        status: 409,
        contentType: 'application/problem+json',
        body: JSON.stringify({ type: 'about:blank', title: 'Conflict', status: 409 }),
      }),
    );
    await page.goto('/calendar');
    const item = page.getByText('Update API docs').filter({ visible: true }).first();
    await expect(item).toBeVisible({ timeout: 15_000 });

    await item.dragTo(cell(page, /^วันศุกร์ 2 ตุลาคม 2026/));
    await expect(page.getByText('รายการนี้ถูกแก้จากที่อื่น', { exact: false })).toBeVisible();
    await expect(cell(page, /^วันศุกร์ 2 ตุลาคม 2026 · ไม่มีรายการ/)).toBeVisible();
    await expect(cell(page, /^วันพุธ 30 กันยายน 2026 · 4 รายการ/)).toBeVisible();
  });

  test('ทางเลือกของคีย์บอร์ด: เลือกวันใหม่ใน day panel · บิลทั้งวันส่งวันที่ล้วน', async ({
    page,
  }) => {
    let body: Record<string, unknown> | null = null;
    await page.route('**/api/v1/entries/e_ais', async (route) => {
      body = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"id":"e_ais"}' });
    });
    await page.goto('/calendar');
    await page
      .getByLabel('ย้าย "AIS Fibre · ฿799.00" ไปวัน')
      .fill('2026-10-01', { timeout: 15_000 });
    await expect.poll(() => body).toEqual({ occurredAt: '2026-10-01', isAllDay: true, version: 3 });
  });
});
