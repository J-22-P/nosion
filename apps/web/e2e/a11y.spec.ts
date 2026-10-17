import AxeBuilder from '@axe-core/playwright';
import { ACTIVE_TASKS, EXPENSES, SETTINGS } from './support/mock-data';
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
  { path: '/habits', ready: 'ดื่มน้ำ' },
  { path: '/review', ready: 'ทำสม่ำเสมอที่สุด' },
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
    await page.getByRole('button', { name: /^วันจันทร์ที่ 5 ตุลาคม 2569/ }).click();
    await expect(page).toHaveURL(/date=2026-10-05/);
    await expect(page.getByRole('heading', { name: 'วันจันทร์ที่ 5 ตุลาคม 2569' })).toBeVisible();
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

    await item.dragTo(cell(page, /^วันศุกร์ที่ 2 ตุลาคม 2569/));
    await expect
      .poll(() => body)
      .toEqual({
        occurredAt: '2026-10-02T07:30:00.000Z', // 14:30 เวลาไทยเหมือนเดิม
        isAllDay: false,
        version: 3,
      });
    await expect(cell(page, /^วันศุกร์ที่ 2 ตุลาคม 2569 · 1 รายการ/)).toBeVisible();
    await expect(cell(page, /^วันพุธที่ 30 กันยายน 2569 · 3 รายการ/)).toBeVisible();
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

    await item.dragTo(cell(page, /^วันศุกร์ที่ 2 ตุลาคม 2569/));
    await expect(page.getByText('รายการนี้ถูกแก้จากที่อื่น', { exact: false })).toBeVisible();
    await expect(cell(page, /^วันศุกร์ที่ 2 ตุลาคม 2569 · ไม่มีรายการ/)).toBeVisible();
    await expect(cell(page, /^วันพุธที่ 30 กันยายน 2569 · 4 รายการ/)).toBeVisible();
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

test.describe('Command palette ⌘K (Phase 5 ขั้น 7)', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  async function openPalette(page: import('@playwright/test').Page) {
    await page.goto('/today');
    await expect(page.getByRole('heading', { name: 'สวัสดีตอนบ่าย Jay' })).toBeVisible({
      timeout: 15_000,
    });
    await page.keyboard.press('ControlOrMeta+k');
    const dialog = page.getByRole('dialog', { name: 'Command palette' });
    await expect(dialog).toBeVisible();
    return { dialog, input: dialog.getByRole('combobox') };
  }

  test('DoD (UI): "ค่าเน็ต 799 ทุกวันที่ 5" → preview บิลประจำ → ↵ บันทึกในคำสั่งเดียว', async ({
    page,
  }) => {
    let body: Record<string, unknown> | null = null;
    await page.route('**/api/v1/parse/commit', async (route) => {
      body = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ entry: { ...EXPENSES[0], title: 'ค่าเน็ต' }, rule: { id: 'r1' } }),
      });
    });
    const { dialog, input } = await openPalette(page);
    await input.fill('ค่าเน็ต 799 ทุกวันที่ 5');

    // highlight จาก parser ฝั่ง client ขึ้นทันที (ไม่รอ server)
    await expect(dialog.getByLabel('ส่วนที่เข้าใจ').locator('mark')).toHaveText([
      '799',
      'ทุกวันที่ 5',
    ]);
    const best = dialog.getByRole('option', { name: /สร้างบิลประจำ/ });
    await expect(best).toContainText(
      'ค่าเน็ต · ฿799 · สาธารณูปโภค · ↻ ทุกเดือน วันที่ 5 · 🔔 เตือน 1',
    );
    await expect(best).toHaveAttribute('aria-selected', 'true');
    await expect(dialog.getByRole('group', { name: 'หรือสร้างเป็น…' })).toContainText('สร้างงาน');

    await input.press('Enter');
    await expect
      .poll(() => body)
      .toMatchObject({
        text: 'ค่าเน็ต 799 ทุกวันที่ 5',
        module: 'expense',
        clientId: expect.stringMatching(/^cmdk-/),
      });
    await expect(page.getByText('สร้างบิลประจำแล้ว')).toBeVisible();
    await expect(dialog).toBeHidden();
  });

  test('เลือกทางเลือกรองด้วย ↓ · ⌘↵ บันทึกแล้วกล่องยังเปิดพร้อมพิมพ์ต่อ', async ({ page }) => {
    const bodies: Record<string, unknown>[] = [];
    await page.route('**/api/v1/parse/commit', async (route) => {
      bodies.push(route.request().postDataJSON() as Record<string, unknown>);
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ entry: ACTIVE_TASKS[0], rule: null }),
      });
    });
    const { dialog, input } = await openPalette(page);
    await input.fill('กาแฟ 65');
    await expect(dialog.getByRole('option', { name: /สร้างรายจ่าย/ })).toBeVisible();
    await input.press('ArrowDown');
    await expect(dialog.getByRole('option', { name: /สร้างงาน/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await input.press('ControlOrMeta+Enter');

    await expect
      .poll(() => bodies)
      .toEqual([expect.objectContaining({ text: 'กาแฟ 65', module: 'task' })]);
    await expect(dialog).toBeVisible();
    await expect(input).toHaveValue('');
  });

  test('ค้นหา: tab ข้ามไปหมวดผลการค้นหา → ↵ เปิดวันนั้นในปฏิทิน', async ({ page }) => {
    const { dialog, input } = await openPalette(page);
    await input.fill('Re-architect');
    const result = dialog.getByRole('option', { name: /Re-architect Auth Token refresh flow/ });
    await expect(result).toBeVisible();
    await input.press('Tab');
    await expect(result).toHaveAttribute('aria-selected', 'true');
    await input.press('Enter');
    await expect(page).toHaveURL(/\/calendar\?date=2026-09-30/);
    await expect(dialog).toBeHidden();
  });

  test('โหมดคำสั่ง ">" — ไปหน้า / สลับธีม · esc ปิด', async ({ page }) => {
    const { dialog, input } = await openPalette(page);
    await input.fill('> ธีม มืด');
    await expect(dialog.getByRole('option')).toHaveText(['ธีมมืด']);
    await input.press('Enter');
    await expect(page.locator('html')).toHaveClass(/dark/);

    await page.keyboard.press('ControlOrMeta+k');
    await input.fill('> calendar');
    await input.press('Enter');
    await expect(page).toHaveURL(/\/calendar$/);

    await page.getByRole('button', { name: /ค้นหาหรือสั่งการ/ }).click();
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  for (const theme of ['light', 'dark'] as const) {
    test(`axe ตอนเปิด palette พร้อมผลลัพธ์ · ${theme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme });
      const { dialog, input } = await openPalette(page);
      await input.fill('กาแฟ 65');
      await expect(dialog.getByRole('option', { name: /สร้างรายจ่าย/ })).toBeVisible();
      const results = await new AxeBuilder({ page })
        .include('dialog')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      const blocking = results.violations
        .filter((v) => v.impact === 'serious' || v.impact === 'critical')
        .map((v) => ({ rule: v.id, targets: v.nodes.map((n) => n.target.join(' ')) }));
      expect(blocking).toEqual([]);
    });
  }
});

test.describe('บันทึกด่วนด้วย NL parser เต็ม (Phase 5 ขั้น 8)', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  async function captureCommit(page: import('@playwright/test').Page) {
    const bodies: Record<string, unknown>[] = [];
    await page.route('**/api/v1/parse/commit', async (route) => {
      bodies.push(route.request().postDataJSON() as Record<string, unknown>);
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ entry: ACTIVE_TASKS[0], rule: null }),
      });
    });
    return bodies;
  }

  test('Tasks: chip จาก parser · แก้เวลาใน chip · ลบ priority · ↵ ส่งข้อความไป /parse/commit', async ({
    page,
  }) => {
    const bodies = await captureCommit(page);
    await page.goto('/tasks');
    const input = page.getByLabel('ชื่องานใหม่');
    await input.fill('ส่งรายงาน พรุ่งนี้ 5 โมง !high #dev', { timeout: 15_000 });

    // วันนี้ของเทสต์ = 30 ก.ย. → "พรุ่งนี้"
    await expect(page.getByRole('button', { name: 'แก้ พรุ่งนี้' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'แก้ !สูง' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'แก้ #dev' })).toBeVisible();

    await page.getByRole('button', { name: 'แก้ 17:00' }).click();
    await page.getByLabel('แก้ 17:00').fill('09:30');
    await page.getByLabel('แก้ 17:00').press('Enter');
    await expect(input).toHaveValue('ส่งรายงาน พรุ่งนี้ 09:30 !high #dev');

    await page.getByRole('button', { name: 'ลบ !high' }).click();
    await expect(input).toHaveValue('ส่งรายงาน พรุ่งนี้ 09:30 #dev');

    // ตัวเลือกวันที่ข้างช่องพิมพ์เขียนลงข้อความ (แทน "พรุ่งนี้")
    const form = page.locator('form').filter({ has: input });
    await form.getByLabel('กำหนดส่ง').fill('2026-10-09');
    await expect(input).toHaveValue('ส่งรายงาน 9/10/2026 09:30 #dev');

    await input.press('Enter');
    await expect
      .poll(() => bodies)
      .toEqual([
        expect.objectContaining({ text: 'ส่งรายงาน 9/10/2026 09:30 #dev', module: 'task' }),
      ]);
    await expect(page.getByText('เพิ่มงานแล้ว')).toBeVisible();
    await expect(input).toHaveValue('');
  });

  test('Expenses: หมวดที่เดาเปลี่ยนได้ → ส่งเป็น payloadPatch', async ({ page }) => {
    const bodies = await captureCommit(page);
    await page.goto('/expenses');
    const input = page.getByLabel('บันทึกรายจ่ายด้วยข้อความ');
    await input.fill('กาแฟ 65', { timeout: 15_000 });
    const category = page.locator('form').filter({ has: input }).getByLabel('หมวด');
    await expect(category).toHaveValue('food');
    await expect(page.getByText('฿65', { exact: true })).toBeVisible();
    await category.selectOption('shopping');
    await input.press('Enter');
    await expect
      .poll(() => bodies)
      .toEqual([
        expect.objectContaining({
          text: 'กาแฟ 65',
          module: 'expense',
          payloadPatch: { category: 'shopping' },
        }),
      ]);
    await expect(page.getByText('บันทึกรายการแล้ว')).toBeVisible();
  });
});

test.describe('ปุ่มลัดทั้งระบบ (Phase 5 ขั้น 9 · สเปก 8.4)', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  async function ready(page: import('@playwright/test').Page, path: string, text: string) {
    await page.goto(path);
    await expect(page.getByText(text).filter({ visible: true }).first()).toBeVisible({
      timeout: 15_000,
    });
    await page.locator('main').click({ position: { x: 5, y: 5 } }); // โฟกัสออกจากช่องพิมพ์
  }

  test('? เปิดตารางปุ่มลัด (axe ผ่าน) · g c / g k ไปหน้า', async ({ page }) => {
    await ready(page, '/today', 'สวัสดีตอนบ่าย Jay');
    await page.keyboard.press('Shift+?');
    const dialog = page.getByRole('dialog', { name: 'ปุ่มลัด' });
    await expect(dialog).toContainText('ไปหน้าปฏิทิน');
    const results = await new AxeBuilder({ page })
      .include('dialog')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(
      results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical'),
    ).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();

    await page.keyboard.press('g');
    await page.keyboard.press('c');
    await expect(page).toHaveURL(/\/calendar$/);
    await page.keyboard.press('g');
    await page.keyboard.press('k');
    await expect(page).toHaveURL(/\/tasks$/);
  });

  test('n โฟกัสช่องสร้างของหน้า · / โฟกัสช่องค้นหา · หน้าที่ไม่มีช่องสร้าง n เปิด palette', async ({
    page,
  }) => {
    await ready(page, '/tasks', 'Re-architect Auth Token refresh flow');
    await page.keyboard.press('n');
    await expect(page.getByLabel('ชื่องานใหม่')).toBeFocused();
    await page.locator('main').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('/');
    await expect(page.locator('[data-shortcut="search"]').filter({ visible: true })).toBeFocused();

    await ready(page, '/calendar', 'Quick Snapshot');
    await page.keyboard.press('n');
    await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeVisible();
  });

  test('j / k เลือกงาน · e เสร็จ · ⌘Z ย้อน · 3 ตั้ง high · x เลือก → ทำเสร็จทั้งชุด', async ({
    page,
  }) => {
    const calls: string[] = [];
    page.on('request', (r) => {
      const url = new URL(r.url());
      if (['POST', 'PATCH'].includes(r.method()) && url.pathname.includes('/entries')) {
        calls.push(
          `${r.method()} ${url.pathname.replace(/^.*\/api\/v1/, '')} ${r.postData() ?? ''}`,
        );
      }
    });
    await ready(page, '/tasks', 'Re-architect Auth Token refresh flow');

    await page.keyboard.press('j');
    const first = page.locator('[data-shortcut-item]').filter({ visible: true }).first();
    await expect(first).toBeFocused();
    await page.keyboard.press('j');
    await page.keyboard.press('k');
    await expect(first).toBeFocused();

    await page.keyboard.press('e');
    await expect.poll(() => calls.at(-1)).toMatch(/^POST \/entries\/e_auth\/complete/);
    // วิธีย้อนถูกลงทะเบียนเมื่อ server ตอบสำเร็จ (ต้องใช้ version ใหม่) — รอ toast ก่อนกด ⌘Z
    await expect(page.getByText('เสร็จแล้ว', { exact: true })).toBeVisible();
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(() => calls.at(-1)).toMatch(/^PATCH \/entries\/e_auth .*"status":"pending"/);
    await expect(
      page.getByText('ย้อนกลับแล้ว: เสร็จ: Re-architect Auth Token refresh flow'),
    ).toBeVisible();

    await first.focus();
    await page.keyboard.press('3');
    await expect.poll(() => calls.at(-1)).toMatch(/^PATCH \/entries\/e_auth .*"priority":"high"/);

    await first.focus();
    await page.keyboard.press('x');
    await page.keyboard.press('j');
    await page.keyboard.press('x');
    const toolbar = page.getByRole('toolbar', { name: 'ทำกับรายการที่เลือก' });
    await expect(toolbar).toContainText('เลือก 2 รายการ');
    await toolbar.getByRole('button', { name: 'ทำเสร็จ' }).click();
    await expect.poll(() => calls.at(-1)).toMatch(/^POST \/entries\/bulk .*"action":"complete"/);
    await expect(page.getByText('ทำเสร็จ 2 รายการ')).toBeVisible();
    await expect(toolbar).toBeHidden();
  });
});

test.describe('นิสัย (Phase 6)', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  function record(page: import('@playwright/test').Page) {
    const calls: string[] = [];
    page.on('request', (r) => {
      if (r.method() !== 'GET' && r.url().includes('/api/v1/')) {
        calls.push(
          `${r.method()} ${new URL(r.url()).pathname.replace(/^.*\/api\/v1/, '')} ${r.postData() ?? ''}`,
        );
      }
    });
    return calls;
  }

  test('หน้า /habits: +1 แสดงทันที · ยกเลิกทำแล้ว · ก่อนเวลา · รายสัปดาห์ · streak', async ({
    page,
  }) => {
    const calls = record(page);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    await page.route('**/api/v1/habits/h_water/increment', async (route) => {
      await gate; // ค้างคำตอบ — ตรวจว่า UI เพิ่มเป็น 6 ทันที (optimistic) ก่อน server ตอบ
      await route.fallback();
    });
    await page.goto('/habits');
    await expect(page.getByText('วันนี้ทำแล้ว 1 จาก 4')).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: 'เพิ่ม ดื่มน้ำ 1 แก้ว' }).click();
    await expect(page.getByLabel('ดื่มน้ำ 6 จาก 8 แก้ว')).toBeVisible();
    await expect.poll(() => calls.at(-1)).toBe('POST /habits/h_water/increment {"delta":1}');
    release();

    await page.getByRole('button', { name: 'ยกเลิกทำแล้ว: อ่านหนังสือ' }).click();
    await expect.poll(() => calls.at(-1)).toBe('POST /habits/h_read/check {"done":false}');

    await expect(page.getByText('ต้องทำให้ทันก่อน 23:45')).toBeVisible();
    await expect(page.getByText('สัปดาห์นี้ 1/3', { exact: false })).toBeVisible();
    await expect(page.getByLabel('ต่อเนื่อง 12 วัน')).toBeVisible();
    await expect(page.getByLabel('ต่อเนื่อง 2 สัปดาห์')).toBeVisible();
  });

  test('สร้างด้วยประโยคเดียว: chip ปริมาณ + ทุกวัน → /parse/commit module habit', async ({
    page,
  }) => {
    const calls = record(page);
    await page.route('**/api/v1/parse/commit', (route) =>
      route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          entry: { ...ACTIVE_TASKS[0], title: 'ดื่มน้ำ' },
          rule: { id: 'r1' },
        }),
      }),
    );
    await page.goto('/habits');
    const input = page.getByLabel('สร้างนิสัยใหม่ด้วยข้อความ');
    await input.fill('ดื่มน้ำ 8 แก้ว ทุกวัน', { timeout: 15_000 });
    await expect(page.getByText('8 แก้ว', { exact: true })).toBeVisible();
    await expect(page.getByText('↻ ทุกวัน', { exact: true })).toBeVisible();
    await input.press('Enter');
    await expect
      .poll(() => calls.at(-1))
      // clientId ใส่ให้เสมอ (Phase 7) — ส่งซ้ำ/เข้าคิวออฟไลน์แล้วไม่สร้างนิสัยซ้ำ
      .toMatch(
        /^POST \/parse\/commit \{"text":"ดื่มน้ำ 8 แก้ว ทุกวัน","module":"habit","clientId":"p-/,
      );
    await expect(page.getByText('สร้างนิสัยแล้ว')).toBeVisible();
  });

  test('การ์ดนิสัยในหน้า Today: −1 · ติ๊ก · บอกเวลาที่ต้องทำให้ทัน', async ({ page }) => {
    const calls = record(page);
    await page.goto('/today');
    await expect(page.getByText('ทำแล้ว 1 จาก 3')).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: 'ลด ดื่มน้ำ 1 แก้ว' }).click();
    await expect.poll(() => calls.at(-1)).toBe('POST /habits/h_water/increment {"delta":-1}');
    await page.getByRole('button', { name: 'ทำแล้ว: นอน' }).click();
    await expect.poll(() => calls.at(-1)).toBe('POST /habits/h_sleep/check {"done":true}');
    await expect(page.getByText('ต้องทำให้ทันก่อน 23:45')).toBeVisible();
  });

  test('ตั้งค่า: เปิด/ปิดโมดูล · Workout ยังเปิดไม่ได้', async ({ page }) => {
    const calls = record(page);
    await page.goto('/settings');
    const habit = page.getByRole('checkbox', { name: 'เปิดใช้โมดูลนิสัย' });
    await expect(habit).toBeChecked({ timeout: 15_000 });
    await expect(page.getByRole('checkbox', { name: 'เปิดใช้โมดูลออกกำลังกาย' })).toBeDisabled();
    await habit.click();
    await expect
      .poll(() => calls.at(-1))
      .toBe('PATCH /me/settings {"enabledModules":["task","expense"]}');
  });
});

test.describe('สรุปสัปดาห์ (Phase 6)', () => {
  test('ทุกโมดูลที่เปิดมีส่วนของตัวเอง · เลื่อนสัปดาห์ด้วย ‹ › และ URL', async ({ page }) => {
    await page.goto('/review');
    await expect(page.getByText('2026-W40')).toBeVisible({ timeout: 15_000 });
    for (const title of ['งาน', 'การเงิน', 'นิสัย']) {
      await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
    }
    await expect(page.getByText('79%')).toBeVisible();
    await page.getByRole('button', { name: 'สัปดาห์ก่อน' }).click();
    await expect(page).toHaveURL(/week=2026-W39/);
    await expect(page.getByText('4/7')).toBeVisible();
    await page.getByRole('button', { name: 'สัปดาห์นี้' }).click();
    await expect(page).toHaveURL(/\/review$/);
  });
});

test.describe('ออฟไลน์ (Phase 7)', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('ตัดเน็ต → เพิ่มงาน 3 รายการ + ติ๊กงานเดิม → เข้าคิวไม่ล้ม · ต่อเน็ต → /sync/push ชุดเดียวตามลำดับ', async ({
    page,
    context,
  }) => {
    type Op = { op: string; opId: string; text?: string; target?: unknown };
    const pushes: Op[][] = [];
    await page.route('**/api/v1/sync/push', async (route) => {
      const { operations } = route.request().postDataJSON() as { operations: Op[] };
      pushes.push(operations);
      await route.fulfill({
        json: {
          results: operations.map((o) => ({ opId: o.opId, status: 'applied' })),
          serverTime: new Date().toISOString(),
        },
      });
    });
    await page.goto('/tasks');
    await expect(page.getByText('Re-architect Auth Token refresh flow').first()).toBeVisible({
      timeout: 15_000,
    });
    await page.locator('main').click({ position: { x: 5, y: 5 } });

    await context.setOffline(true);
    await page.keyboard.press('j');
    await page.keyboard.press('e');
    await expect(page.getByText('เสร็จแล้ว', { exact: true })).toBeVisible();

    const input = page.getByLabel('ชื่องานใหม่');
    for (const title of ['ออฟไลน์ 1', 'ออฟไลน์ 2', 'ออฟไลน์ 3']) {
      await input.fill(title);
      await input.press('Enter');
      await expect(input).toHaveValue('');
    }
    await expect(page.getByText(/ออฟไลน์ 3 · บันทึกในเครื่องแล้ว/)).toBeVisible();
    expect(pushes).toEqual([]);

    // UI สถานะ (ขั้น 4): pill แดงบอกจำนวน · งานที่เพิ่มขึ้นในรายการพร้อมจุด "รอซิงก์"
    await expect(
      page.getByRole('status').filter({ hasText: 'ออฟไลน์ · รอซิงก์ 4' }).first(),
    ).toBeVisible();
    for (const title of ['ออฟไลน์ 1', 'ออฟไลน์ 2', 'ออฟไลน์ 3']) {
      await expect(page.getByRole('listitem', { name: `${title} (รอซิงก์)` })).toBeVisible();
    }
    await expect(
      page.getByRole('listitem', { name: 'Re-architect Auth Token refresh flow (รอซิงก์)' }),
    ).toBeVisible();

    // คิวอยู่ใน IndexedDB — รีเฟรชไม่ได้ตอนออฟไลน์ (ขั้น 3) แต่ดูของในที่เก็บได้
    const stored = await page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          const req = indexedDB.open('nosion-sync');
          req.onsuccess = () => {
            const count = req.result.transaction('outbox').objectStore('outbox').count();
            count.onsuccess = () => resolve(count.result);
          };
        }),
    );
    expect(stored).toBe(4);

    await context.setOffline(false);
    await expect.poll(() => pushes.length).toBe(1);
    expect(pushes[0]!.map((o) => [o.op, o.text ?? o.target])).toEqual([
      ['complete', { id: 'e_auth' }],
      ['parse', 'ออฟไลน์ 1'],
      ['parse', 'ออฟไลน์ 2'],
      ['parse', 'ออฟไลน์ 3'],
    ]);
    await expect(page.getByText('ซิงก์แล้ว 4 รายการ')).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: /^Online$/ })).toBeVisible();
  });

  test('แก้ชนกับอุปกรณ์อื่น: toast บอกช่องที่ชน → "ดูรายละเอียด" เปิด dialog ค่าของคุณ vs ค่าที่ใช้ · Sync Status ใน sidebar', async ({
    page,
    context,
  }) => {
    await page.route('**/api/v1/sync/push', async (route) => {
      const { operations } = route.request().postDataJSON() as {
        operations: { opId: string }[];
      };
      await route.fulfill({
        json: {
          results: operations.map((o) => ({
            opId: o.opId,
            status: 'conflict',
            entry: { ...ACTIVE_TASKS[0], priority: 'urgent' },
            conflicts: [{ field: 'priority', client: 'low', server: 'urgent' }],
          })),
          serverTime: new Date().toISOString(),
        },
      });
    });
    await page.goto('/tasks');
    await expect(page.getByText('Re-architect Auth Token refresh flow').first()).toBeVisible({
      timeout: 15_000,
    });
    await page.locator('main').click({ position: { x: 5, y: 5 } });

    await context.setOffline(true);
    await page.keyboard.press('j');
    await page.keyboard.press('1'); // ตั้งเป็น low (เดิม urgent) ตอนออฟไลน์ — อีกเครื่องคง urgent ไว้
    await context.setOffline(false);

    await expect(page.getByText('แก้ชนกับอุปกรณ์อื่น — ใช้ค่าบนเซิร์ฟเวอร์')).toBeVisible();
    await page.getByRole('button', { name: 'ดูรายละเอียด' }).click();
    const dialog = page.getByRole('dialog', { name: 'แก้ชนกับอุปกรณ์อื่น' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('row', { name: 'ความสำคัญ low urgent' })).toBeVisible();
    const axe = await new AxeBuilder({ page })
      .include('dialog')
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    expect(axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual(
      [],
    );
    await page.keyboard.press('Escape');

    // Sync Status ใน sidebar: popover บอกซิงก์ล่าสุด + ปุ่มซิงก์เดี๋ยวนี้ + ทางไปดูรายการที่ชน
    await page.getByRole('button', { name: /^สถานะการซิงก์/ }).click();
    const panel = page.getByRole('region', { name: 'สถานะการซิงก์' });
    await expect(panel.getByText('เมื่อสักครู่')).toBeVisible();
    await expect(panel.getByRole('button', { name: 'ซิงก์เดี๋ยวนี้' })).toBeEnabled();
    await panel.getByRole('button', { name: 'ดูรายการที่แก้ชน (1)' }).click();
    await expect(dialog).toBeVisible();
  });

  test('เปิดแอปตอนออฟไลน์: รีเฟรชแล้วยังอยู่ในแอป เห็นข้อมูลเดิมจาก IndexedDB · SW เก็บทุกหน้าไว้ · เพิ่มงานหลังรีเฟรชแล้วซิงก์ได้', async ({
    page,
    context,
  }) => {
    const pushes: { op: string; text?: string }[][] = [];
    await page.route('**/api/v1/sync/push', async (route) => {
      const { operations } = route.request().postDataJSON() as {
        operations: { op: string; opId: string; text?: string }[];
      };
      pushes.push(operations);
      await route.fulfill({
        json: {
          results: operations.map((o) => ({ opId: o.opId, status: 'applied' })),
          serverTime: new Date().toISOString(),
        },
      });
    });
    await page.goto('/tasks');
    const title = page.getByText('Re-architect Auth Token refresh flow').first();
    await expect(title).toBeVisible({ timeout: 15_000 });

    // แคชของ query ถูกเขียนลงดิสก์ (หน่วง 1 วิ) · SW ติดตั้งแล้วเก็บทุกหน้าของแอป
    await expect
      .poll(
        () =>
          page.evaluate(
            () =>
              new Promise<boolean>((resolve) => {
                const req = indexedDB.open('nosion-cache');
                req.onsuccess = () => {
                  const get = req.result.transaction('kv').objectStore('kv').get('query-cache');
                  get.onsuccess = () => resolve(Boolean(get.result));
                  get.onerror = () => resolve(false);
                };
                req.onerror = () => resolve(false);
              }),
          ),
        { timeout: 10_000 },
      )
      .toBe(true);
    await expect
      .poll(
        () =>
          page.evaluate(async () => {
            const pages = await caches.open('nosion-pages-v1');
            return (
              await Promise.all(['/today', '/calendar', '/habits'].map((p) => pages.match(p)))
            ).every(Boolean);
          }),
        { timeout: 15_000 },
      )
      .toBe(true);

    // SW ต้องคุมหน้านี้อยู่ก่อนตัดเน็ต (clients.claim หลังติดตั้ง) — ไม่งั้นรีเฟรชไม่ผ่าน SW
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
    await context.setOffline(true);
    await page.reload();
    await expect(page).toHaveURL(/\/tasks/);
    await expect(title).toBeVisible({ timeout: 15_000 });

    const input = page.getByLabel('ชื่องานใหม่');
    await input.fill('หลังรีเฟรชตอนออฟไลน์');
    await input.press('Enter');
    await expect(page.getByText(/บันทึกในเครื่องแล้ว/)).toBeVisible();

    await context.setOffline(false);
    await expect.poll(() => pushes.length).toBe(1);
    expect(pushes[0]!.map((o) => [o.op, o.text])).toEqual([['parse', 'หลังรีเฟรชตอนออฟไลน์']]);

    // หน้าที่ไม่เคยเปิดเลยก็เปิดตอนออฟไลน์ได้ (SW เก็บหน้า + JS ไว้ตั้งแต่ติดตั้ง) — ข้อมูลยังไม่มีแต่แอปไม่พัง
    await context.setOffline(true);
    await page.goto('/habits');
    await expect(page.getByLabel('สร้างนิสัยใหม่ด้วยข้อความ')).toBeVisible({ timeout: 15_000 });
  });

  test('PWA ติดตั้งได้: manifest ครบ + service worker คุมหน้า → Chromium ไม่รายงาน installability error', async ({
    page,
  }) => {
    await page.goto('/today');
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, {
      timeout: 15_000,
    });
    const cdp = await page.context().newCDPSession(page);
    const { installabilityErrors } = (await cdp.send('Page.getInstallabilityErrors')) as {
      installabilityErrors: { errorId: string }[];
    };
    expect(installabilityErrors.map((e) => e.errorId)).toEqual([]);
  });
});

test.describe('Settings · API key (Phase 8 ขั้น 4)', () => {
  test('สร้าง key → เห็น key เต็มครั้งเดียวพร้อมปุ่มคัดลอก · เพิกถอนต้องกดยืนยัน', async ({
    page,
  }) => {
    let created: Record<string, unknown> | null = null;
    let revoked: string | null = null;
    await page.route('**/api/v1/me/api-keys**', async (route) => {
      const req = route.request();
      if (req.method() === 'POST') {
        created = req.postDataJSON() as Record<string, unknown>;
        return route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 'key-new',
            name: created.name,
            keyPrefix: 'nos_Zz99Yy88',
            scopes: created.scopes,
            lastUsedAt: null,
            expiresAt: null,
            createdAt: '2026-10-17T02:00:00.000Z',
            key: 'nos_Zz99Yy88-full-secret-shown-once',
          }),
        });
      }
      if (req.method() === 'DELETE') {
        revoked = new URL(req.url()).pathname.split('/').pop() ?? null;
        return route.fulfill({ status: 204 });
      }
      return route.fallback();
    });

    await page.goto('/settings');
    await expect(page.getByText('สคริปต์สรุปรายจ่าย')).toBeVisible({ timeout: 15_000 });

    await page.getByLabel('ชื่อ key').fill('Zapier');
    await page.getByRole('checkbox', { name: 'เขียน (สร้าง/แก้/ลบ)' }).click();
    await page.getByRole('button', { name: 'สร้าง API key' }).click();

    await expect(page.getByLabel('API key ใหม่')).toHaveValue(
      'nos_Zz99Yy88-full-secret-shown-once',
    );
    expect(created).toEqual({ name: 'Zapier', scopes: ['read', 'write'], expiresInDays: null });

    const results = await new AxeBuilder({ page }).include('form').analyze();
    expect(
      results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical'),
    ).toEqual([]);

    await page.getByRole('button', { name: 'เพิกถอน สคริปต์สรุปรายจ่าย' }).click();
    expect(revoked).toBeNull();
    await page.getByRole('button', { name: 'ยืนยันเพิกถอน สคริปต์สรุปรายจ่าย' }).click();
    await expect.poll(() => revoked).toBe('key-1');
  });
});

test.describe('OAuth · Google / GitHub (Phase 8 ขั้น 4b)', () => {
  test('หน้า login มีปุ่มทั้งสองเป็นลิงก์ไป API พร้อมโซนเวลา · กลับมาพร้อม oauth_error → แจ้งเป็นภาษาคน', async ({
    page,
  }) => {
    await page.goto('/login?oauth_error=email_conflict');
    // Next มี route announcer เป็น role=alert อีกตัว — หาจากข้อความแทน
    await expect(
      page.getByText('อีเมลนี้มีบัญชีที่ยังไม่ได้ยืนยันอยู่แล้ว', { exact: false }),
    ).toBeVisible({
      timeout: 15_000,
    });
    const google = page.getByRole('link', { name: 'ดำเนินการต่อด้วย Google' });
    await expect(google).toBeVisible();
    await expect(page.getByRole('link', { name: 'ดำเนินการต่อด้วย GitHub' })).toBeVisible();

    // กดแล้ว href ถูกเติมโซนเวลาก่อนเปิดหน้า — ดักการเปิดหน้าไว้ไม่ให้ออกไปข้างนอกจริง
    await page.route('**/api/v1/auth/oauth/google**', (route) =>
      route.fulfill({ status: 200, body: 'redirected' }),
    );
    await google.click();
    await expect(page).toHaveURL(/\/api\/v1\/auth\/oauth\/google\?tz=Asia%2FBangkok/);
  });

  test('ตั้งค่า: เห็นบัญชีที่เชื่อม · GitHub ยังไม่เชื่อม → เลือกรวม repo ส่วนตัวแล้วเชื่อม', async ({
    page,
  }) => {
    let linkBody: unknown = null;
    await page.route('**/api/v1/auth/oauth/github/link', async (route) => {
      linkBody = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ url: 'http://localhost:3000/settings?connected=github' }),
      });
    });
    await page.goto('/settings');
    await expect(page.getByText('jay@example.com')).toBeVisible({ timeout: 15_000 });
    await page.getByRole('checkbox', { name: 'รวม repo ส่วนตัว' }).click();
    await page.getByRole('button', { name: 'เชื่อม GitHub', exact: true }).first().click();
    await expect.poll(() => linkBody).toEqual({ includePrivateRepos: true });
    // กลับมาจาก GitHub → แจ้งผลแล้วล้าง query
    await expect(page.getByText('เชื่อม GitHub แล้ว')).toBeVisible();
    await expect(page).toHaveURL(/\/settings$/);
  });
});

test.describe('GitHub → งานและปฏิทิน (Phase 8 ขั้น 5)', () => {
  test('เชื่อมแล้ว: ดึงงานตอนนี้ · เปิด webhook เห็น URL + secret ครั้งเดียว · axe ผ่าน', async ({
    page,
  }) => {
    let synced = false;
    await page.route('**/api/v1/integrations/github**', async (route) => {
      const req = route.request();
      const path = new URL(req.url()).pathname;
      const json = (body: unknown, status = 200) =>
        route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
      if (req.method() === 'GET') {
        return json({
          connected: true,
          login: 'octocat',
          privateRepos: false,
          lastSyncAt: synced ? '2026-10-17T05:00:00.000Z' : null,
          lastSyncCount: synced ? 3 : null,
          lastSyncError: null,
          webhook: { url: null, configured: false, lastDeliveryAt: null },
        });
      }
      if (path.endsWith('/sync')) {
        synced = true;
        return json({ created: 2, updated: 1, completed: 0, unchanged: 4 });
      }
      if (path.endsWith('/webhook')) {
        return json(
          { url: 'https://nosion.dev/api/v1/webhooks/github/abc123', secret: 'whsec-shown-once' },
          201,
        );
      }
      return route.fallback();
    });

    await page.goto('/settings');
    await expect(page.getByText('octocat')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('ยังไม่เคยดึง')).toBeVisible();

    await page.getByRole('button', { name: 'ดึงงานตอนนี้' }).click();
    await expect(page.getByText('ดึงจาก GitHub แล้ว 3 รายการ')).toBeVisible();

    await page.getByRole('button', { name: 'เปิด webhook' }).click();
    await expect(page.getByLabel('Payload URL', { exact: true })).toHaveValue(
      'https://nosion.dev/api/v1/webhooks/github/abc123',
    );
    await expect(page.getByLabel('Secret (แสดงครั้งเดียว)', { exact: true })).toHaveValue(
      'whsec-shown-once',
    );

    const results = await new AxeBuilder({ page })
      .include('section[aria-labelledby="gh-webhook-title"]')
      .analyze();
    expect(
      results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical'),
    ).toEqual([]);
  });

  test('งานที่ดึงจาก GitHub: ป้าย repo#เลข เป็นลิงก์ไป GitHub', async ({ page }) => {
    const [first, ...rest] = ACTIVE_TASKS;
    const fromGitHub = {
      ...first!,
      payload: {
        ...first!.payload,
        github: {
          repo: 'jay/nosion',
          issueNumber: 42,
          prNumber: null,
          autoCloseOnMerge: true,
          url: 'https://github.com/jay/nosion/issues/42',
          milestoneDueOn: null,
          state: 'open',
        },
      },
    };
    await page.route('**/api/v1/entries?**', async (route) => {
      const url = new URL(route.request().url());
      if (
        url.searchParams.get('status') === 'done' ||
        url.searchParams.get('module') === 'expense'
      ) {
        return route.fallback();
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [fromGitHub, ...rest],
          pageInfo: { hasMore: false, nextCursor: null },
        }),
      });
    });
    await page.goto('/tasks');
    const link = page.getByRole('link', { name: 'เปิด issue jay/nosion#42 บน GitHub' });
    await expect(link).toBeVisible({ timeout: 15_000 });
    await expect(link).toHaveAttribute('href', 'https://github.com/jay/nosion/issues/42');
  });
});

test.describe('i18n · English (Phase 8 ขั้น 6)', () => {
  test('หน้า login: กด English → คุกกี้ภาษา + หน้าเป็นภาษาอังกฤษ (URL เดิม ไม่มี /en)', async ({
    page,
  }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'เข้าสู่ระบบ' })).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole('button', { name: 'English' }).click();
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible({ timeout: 15_000 });
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    const cookies = await page.context().cookies();
    expect(cookies.find((c) => c.name === 'NOSION_LOCALE')?.value).toBe('en');
    await expect(page.getByRole('link', { name: 'Continue with Google' })).toBeVisible();
  });

  const EN_PAGES = [
    { path: '/today', ready: 'Good afternoon, Jay' },
    { path: '/tasks', ready: 'All tasks' },
    { path: '/expenses', ready: 'Spent this month' },
    { path: '/calendar', ready: 'Quick Snapshot' },
    { path: '/habits', ready: 'Habits' },
    { path: '/review', ready: 'Weekly review' },
    { path: '/settings', ready: 'Language & dates' },
  ] as const;

  for (const { path, ready } of EN_PAGES) {
    test(`${path} เป็นภาษาอังกฤษ · axe ผ่าน`, async ({ page, context, baseURL }) => {
      await context.addCookies([{ name: 'NOSION_LOCALE', value: 'en', url: baseURL! }]);
      await page.goto(path);
      await expect(page.getByText(ready).first()).toBeVisible({ timeout: 15_000 });
      await settle(page);
      await expect(page.locator('html')).toHaveAttribute('lang', 'en');
      // เมนูหลักไม่มีชื่อไทยในวงเล็บ/ภาษาไทยหลงเหลือ (ข้อมูลของผู้ใช้ใน mock เป็นไทยได้ — ตรวจเฉพาะ nav)
      const nav = page.getByRole('navigation', { name: 'Main menu' });
      if (await nav.isVisible()) await expect(nav).not.toContainText(/[฀-๿]/);
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      expect(
        results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical'),
      ).toEqual([]);
    });
  }
});
