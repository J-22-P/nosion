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

/**
 * DoD Phase 5 (สเปก 15): พิมพ์ "ค่าเน็ต 799 ทุกวันที่ 5" ใน ⌘K แล้วได้บิลรายเดือนพร้อมการเตือน ครบในคำสั่งเดียว
 * ใช้ API + DB จริง: parser จริง → กฎการเกิดซ้ำ + entry + การเตือน → เห็นบนปฏิทินวันที่ 5 พร้อมการเตือน
 */
test('⌘K: "ค่าเน็ต 799 ทุกวันที่ 5" → บิลรายเดือนพร้อมการเตือน ในคำสั่งเดียว', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /ลองใช้ทันที/ }).click();
  await page.waitForURL('**/tasks');
  // URL เปลี่ยนก่อน shell ของแอป mount — รอหน้าพร้อมก่อนกด ไม่งั้นปุ่มลัดไปตกที่หน้าเดิม
  await expect(page.getByLabel('ชื่องานใหม่')).toBeVisible();

  await page.keyboard.press('ControlOrMeta+k');
  const dialog = page.getByRole('dialog', { name: 'Command palette' });
  const input = dialog.getByRole('combobox');
  await input.fill('ค่าเน็ต 799 ทุกวันที่ 5');
  await expect(dialog.getByRole('option', { name: /สร้างบิลประจำ/ })).toContainText(
    '↻ ทุกเดือน วันที่ 5',
  );
  await input.press('Shift+Enter'); // บันทึกแล้วเปิดวันนั้นในปฏิทิน
  await expect(page.getByText('สร้างบิลประจำแล้ว')).toBeVisible();

  // ⇧↵ พาไปวันครบกำหนดรอบแรก — day panel แสดงบิล + ปุ่มจ่ายแล้ว
  await page.waitForURL(/\/calendar\?date=\d{4}-\d{2}-05$/);
  const panel = page.getByRole('heading', { name: /^วัน.+ 5 / });
  await expect(panel).toBeVisible();
  await expect(page.getByText('ค่าเน็ต · ฿799.00').filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'จ่ายแล้ว' })).toBeVisible();

  // การเตือนล่วงหน้า 1 วัน 09:00 ยิงวันที่ 4 → ไปดูวันที่ 4 ต้องเห็น "Push 09:00 · รอส่ง"
  const due = new URL(page.url()).searchParams.get('date')!;
  const dayBefore = new Date(Date.parse(due) - 86_400_000).toISOString().slice(0, 10);
  await page.goto(`/calendar?date=${dayBefore}`);
  await expect(page.getByText('Push 09:00 · รอส่ง')).toBeVisible();
});

test('บันทึกด่วนหน้า Expenses: บิลรายเดือนเป็นกฎ + การเตือน (ก่อนขั้น 8 ได้แค่รายการเดียว)', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: /ลองใช้ทันที/ }).click();
  await page.waitForURL('**/tasks');
  await expect(page.getByLabel('ชื่องานใหม่')).toBeVisible();

  await page.goto('/expenses');
  const input = page.getByLabel('บันทึกรายจ่ายด้วยข้อความ');
  await input.fill('ค่าน้ำ 150 ทุกวันที่ 20');
  await expect(page.getByText('บิลประจำ · เตือนล่วงหน้า 1 วัน')).toBeVisible();
  await input.press('Enter');
  await expect(page.getByText('ตั้งบิลประจำแล้ว')).toBeVisible();
});

/**
 * DoD Phase 7 (สเปก 15): เปิดโหมดเครื่องบิน → ใช้แอปได้ปกติ → ปิดโหมด → ข้อมูลขึ้น server ครบ
 * API + DB จริง: รีเฟรชตอนออฟไลน์ (SW + แคชใน IndexedDB) → สร้าง 3 งาน → ต่อเน็ต → server มีครบ 3 ไม่ซ้ำ
 */
test('DoD Phase 7: ออฟไลน์ → รีเฟรช → สร้าง 3 งาน → ต่อเน็ต → server มีครบ 3 ไม่ซ้ำ', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: /ลองใช้ทันที/ }).click();
  await page.waitForURL('**/tasks');
  const input = page.getByLabel('ชื่องานใหม่');
  await expect(input).toBeVisible();

  // พร้อมออฟไลน์: SW คุมหน้า + เก็บทุกหน้าแล้ว + แคชของ query ลงดิสก์แล้ว
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, {
    timeout: 15_000,
  });
  await expect
    .poll(() => page.evaluate(async () => Boolean(await caches.match('/today'))), {
      timeout: 20_000,
    })
    .toBe(true);
  await page.waitForTimeout(1_500);

  await context.setOffline(true);
  await page.reload();
  await expect(input).toBeVisible({ timeout: 15_000 });

  const stamp = Date.now();
  const titles = [1, 2, 3].map((i) => `ออฟไลน์ ${stamp} #${i}`);
  for (const title of titles) {
    await input.fill(title);
    await input.press('Enter');
    await expect(input).toHaveValue('');
  }
  await expect(
    page.getByRole('status').filter({ hasText: 'ออฟไลน์ · รอซิงก์ 3' }).first(),
  ).toBeVisible();

  await context.setOffline(false);
  await expect(page.getByText('ซิงก์แล้ว 3 รายการ')).toBeVisible({ timeout: 15_000 });

  // ถาม server ตรง (refresh cookie ของ context นี้) — ต้องมีครบ 3 และไม่ซ้ำ
  const api = `${process.env.E2E_API_URL ?? 'http://localhost:3001'}/api/v1`;
  const { accessToken } = (await (await page.request.post(`${api}/auth/refresh`)).json()) as {
    accessToken: string;
  };
  const res = await page.request.get(`${api}/entries?q=${encodeURIComponent(String(stamp))}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const { data } = (await res.json()) as { data: { title: string }[] };
  expect(data.map((e) => e.title).sort()).toEqual(titles);
});
